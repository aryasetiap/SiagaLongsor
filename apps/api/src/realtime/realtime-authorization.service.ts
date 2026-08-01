import { Injectable } from '@nestjs/common';

import { AccessTokenService } from '../auth/access-token.service.js';
import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class RealtimeAuthorizationService {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async verifiedExpiryMilliseconds(authorization: string): Promise<number> {
    const token = authorization.slice('Bearer '.length).trim();
    const claims = await this.accessTokens.verify(token);
    return claims.exp * 1_000;
  }

  async remainsAuthorized(
    principal: AuthenticatedPrincipal,
    organizationId: string,
  ): Promise<boolean> {
    const session = await this.prisma.refreshSession.findFirst({
      where: {
        id: principal.sessionId,
        userId: principal.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: {
          isActive: true,
          memberships: { some: { organizationId, isActive: true } },
        },
      },
      select: { id: true },
    });
    return session !== null;
  }
}
