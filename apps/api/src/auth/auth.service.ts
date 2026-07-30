import { randomUUID } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { AuthAuditEvent, authAuditData, hashAuditIdentifier } from '../audit/audit-log.js';
import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';
import type { AuditRequestContext } from '../common/http/request-context.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { PrismaService } from '../database/prisma.service.js';
import type { RefreshSession, User } from '../generated/prisma/client.js';
import { AccessTokenService } from './access-token.service.js';
import type { AuthTokenResult } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import { PasswordService } from './password.service.js';
import { RefreshTokenService } from './refresh-token.service.js';

type UserWithMemberships = User & {
  memberships: Array<{
    organizationId: string;
    role: 'PROJECT_OWNER' | 'SCHOOL_ADMIN';
    organization: { name: string };
  }>;
};

type SessionWithUser = RefreshSession & { user: UserWithMemberships };

class RefreshRotationConflictError extends Error {}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly accessTokens: AccessTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async login(input: LoginDto, request: AuditRequestContext): Promise<AuthTokenResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
      include: {
        memberships: {
          where: { isActive: true },
          include: { organization: { select: { name: true } } },
        },
      },
    });
    const passwordValid = await this.passwords.verify(input.password, user?.passwordHash);

    if (user === null || !passwordValid || !user.isActive) {
      await this.prisma.auditLog.create({
        data: authAuditData({
          eventType: AuthAuditEvent.LOGIN_FAILED,
          request,
          metadata: {
            emailHash: hashAuditIdentifier(normalizedEmail),
            reason: user?.isActive === false ? 'USER_DISABLED' : 'INVALID_CREDENTIALS',
          },
        }),
      });
      throw invalidCredentials();
    }

    const sessionId = randomUUID();
    const sessionFamilyId = randomUUID();
    const refreshToken = this.refreshTokens.create();
    const expiresAt = this.refreshExpiry();
    const principal = this.toPrincipal(user, sessionId);
    const accessToken = await this.createAccessToken(principal);

    await this.prisma.$transaction([
      this.prisma.refreshSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash: refreshToken.hash,
          sessionFamilyId,
          expiresAt,
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
        },
      }),
      this.prisma.auditLog.create({
        data: authAuditData({
          eventType: AuthAuditEvent.LOGIN_SUCCEEDED,
          request,
          actorId: user.id,
          sessionId,
          metadata: {},
        }),
      }),
    ]);

    return this.tokenResult(accessToken, refreshToken.raw, principal);
  }

  async refresh(rawToken: string, request: AuditRequestContext): Promise<AuthTokenResult> {
    const tokenHash = this.refreshTokens.hash(rawToken);
    const session = await this.findSessionByHash(tokenHash);

    if (session === null) {
      await this.auditRejectedRefresh(request, 'TOKEN_UNKNOWN');
      throw invalidRefreshToken();
    }

    if (session.revokedAt !== null) {
      await this.revokeFamilyForRejectedRefresh(session, request, 'TOKEN_REUSED');
      throw invalidRefreshToken();
    }

    if (session.expiresAt <= new Date()) {
      await this.revokeFamilyForRejectedRefresh(session, request, 'TOKEN_EXPIRED');
      throw invalidRefreshToken();
    }

    if (!session.user.isActive) {
      await this.revokeFamilyForRejectedRefresh(session, request, 'USER_DISABLED');
      throw invalidRefreshToken();
    }

    const nextSessionId = randomUUID();
    const nextRefreshToken = this.refreshTokens.create();
    const principal = this.toPrincipal(session.user, nextSessionId);
    const accessToken = await this.createAccessToken(principal);
    const now = new Date();

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.refreshSession.create({
          data: {
            id: nextSessionId,
            userId: session.userId,
            tokenHash: nextRefreshToken.hash,
            sessionFamilyId: session.sessionFamilyId,
            expiresAt: this.refreshExpiry(),
            ipAddress: request.ipAddress,
            userAgent: request.userAgent,
          },
        });
        const rotated = await transaction.refreshSession.updateMany({
          where: {
            id: session.id,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            revokedAt: now,
            lastUsedAt: now,
            replacedById: nextSessionId,
          },
        });

        if (rotated.count !== 1) {
          throw new RefreshRotationConflictError();
        }

        await transaction.auditLog.create({
          data: authAuditData({
            eventType: AuthAuditEvent.REFRESH_ROTATED,
            request,
            actorId: session.userId,
            sessionId: nextSessionId,
            metadata: { previousSessionId: session.id },
          }),
        });
      });
    } catch (error) {
      if (!(error instanceof RefreshRotationConflictError)) {
        throw error;
      }

      await this.revokeFamilyForRejectedRefresh(session, request, 'CONCURRENT_REUSE');
      throw invalidRefreshToken();
    }

    return this.tokenResult(accessToken, nextRefreshToken.raw, principal);
  }

  async logout(rawToken: string | undefined, request: AuditRequestContext): Promise<void> {
    const session =
      rawToken === undefined
        ? null
        : await this.findSessionByHash(this.refreshTokens.hash(rawToken));
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      if (session !== null) {
        await transaction.refreshSession.updateMany({
          where: { sessionFamilyId: session.sessionFamilyId, revokedAt: null },
          data: { revokedAt: now },
        });
      }

      await transaction.auditLog.create({
        data: authAuditData({
          eventType: AuthAuditEvent.LOGOUT,
          request,
          actorId: session?.userId ?? null,
          sessionId: session?.id ?? null,
          metadata: { sessionFound: session !== null },
        }),
      });
    });
  }

  async authenticateAccessToken(token: string): Promise<AuthenticatedPrincipal> {
    const claims = await this.accessTokens.verify(token);
    const session = await this.prisma.refreshSession.findUnique({
      where: { id: claims.sid },
      include: {
        user: {
          include: {
            memberships: {
              where: { isActive: true },
              include: { organization: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (
      session === null ||
      session.userId !== claims.sub ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date() ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: 'Sesi tidak aktif.',
      });
    }

    return this.toPrincipal(session.user, session.id);
  }

  private async findSessionByHash(tokenHash: string): Promise<SessionWithUser | null> {
    return this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            memberships: {
              where: { isActive: true },
              include: { organization: { select: { name: true } } },
            },
          },
        },
      },
    });
  }

  private async revokeFamilyForRejectedRefresh(
    session: SessionWithUser,
    request: AuditRequestContext,
    reason: 'TOKEN_REUSED' | 'TOKEN_EXPIRED' | 'USER_DISABLED' | 'CONCURRENT_REUSE',
  ): Promise<void> {
    const eventType =
      reason === 'TOKEN_REUSED' || reason === 'CONCURRENT_REUSE'
        ? AuthAuditEvent.REFRESH_REUSE_DETECTED
        : AuthAuditEvent.REFRESH_REJECTED;

    await this.prisma.$transaction([
      this.prisma.refreshSession.updateMany({
        where: { sessionFamilyId: session.sessionFamilyId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: authAuditData({
          eventType,
          request,
          actorId: session.userId,
          sessionId: session.id,
          metadata: { reason },
        }),
      }),
    ]);
  }

  private async auditRejectedRefresh(
    request: AuditRequestContext,
    reason: 'TOKEN_UNKNOWN',
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: authAuditData({
        eventType: AuthAuditEvent.REFRESH_REJECTED,
        request,
        metadata: { reason },
      }),
    });
  }

  private createAccessToken(principal: AuthenticatedPrincipal): Promise<string> {
    return this.accessTokens.sign({
      sub: principal.userId,
      sid: principal.sessionId,
      type: 'access',
      jti: randomUUID(),
    });
  }

  private toPrincipal(user: UserWithMemberships, sessionId: string): AuthenticatedPrincipal {
    return {
      userId: user.id,
      sessionId,
      email: user.email,
      name: user.name,
      memberships: user.memberships.map((membership) => ({
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        role: membership.role,
      })),
    };
  }

  private tokenResult(
    accessToken: string,
    refreshToken: string,
    principal: AuthenticatedPrincipal,
  ): AuthTokenResult {
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.config.auth.accessTokenTtlSeconds,
      principal,
    };
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.config.auth.refreshTokenTtlSeconds * 1_000);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    message: 'Email atau password tidak valid.',
  });
}

function invalidRefreshToken(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'REFRESH_TOKEN_INVALID',
    message: 'Refresh token tidak valid atau sudah kedaluwarsa.',
  });
}
