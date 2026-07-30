import { createHash, randomUUID } from 'node:crypto';

import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import argon2 from 'argon2';
import request, {
  type Response as SuperTestResponse,
  type Test as SuperTestRequest,
} from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { configureApp } from '../bootstrap/configure-app.js';
import { PrismaService } from '../database/prisma.service.js';
import { Role } from '../generated/prisma/enums.js';
import { OrganizationScoped } from '../authorization/organization-scoped.decorator.js';
import { Roles } from '../authorization/roles.decorator.js';

@Controller('test/organizations/:organizationId')
class AuthorizationProbeController {
  @OrganizationScoped()
  @Get('member')
  member(): { allowed: true } {
    return { allowed: true };
  }

  @OrganizationScoped()
  @Roles(Role.PROJECT_OWNER)
  @Get('owner')
  owner(): { allowed: true } {
    return { allowed: true };
  }
}

describe('authentication and authorization', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  const testRunId = randomUUID();
  const requestPrefix = `auth-e2e-${testRunId}`;
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const ownerId = randomUUID();
  const adminId = randomUUID();
  const disabledId = randomUUID();
  const password = `Test-password-${randomUUID()}`;
  const ownerEmail = `owner-${testRunId}@example.invalid`;
  const adminEmail = `admin-${testRunId}@example.invalid`;
  const disabledEmail = `disabled-${testRunId}@example.invalid`;
  let requestSequence = 0;

  beforeAll(async () => {
    setTestEnvironment(100);
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AuthorizationProbeController],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'E2E Organization A', slug: `e2e-a-${testRunId}` },
        { id: organizationBId, name: 'E2E Organization B', slug: `e2e-b-${testRunId}` },
      ],
    });
    await prisma.user.createMany({
      data: [
        userData(ownerId, ownerEmail, 'E2E Owner', passwordHash, true),
        userData(adminId, adminEmail, 'E2E Admin', passwordHash, true),
        userData(disabledId, disabledEmail, 'E2E Disabled', passwordHash, false),
      ],
    });
    await prisma.membership.createMany({
      data: [
        { organizationId: organizationAId, userId: ownerId, role: Role.PROJECT_OWNER },
        { organizationId: organizationAId, userId: adminId, role: Role.SCHOOL_ADMIN },
        { organizationId: organizationAId, userId: disabledId, role: Role.SCHOOL_ADMIN },
      ],
    });
  }, 30_000);

  afterAll(async () => {
    if (prisma !== undefined) {
      await prisma.auditLog.deleteMany({ where: { requestId: { startsWith: requestPrefix } } });
      await prisma.refreshSession.deleteMany({
        where: { userId: { in: [ownerId, adminId, disabledId] } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: [ownerId, adminId, disabledId] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, adminId, disabledId] } } });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationAId, organizationBId] } },
      });
    }
    await app?.close();
  });

  it('reports PostgreSQL and Redis health without authentication', async () => {
    const response = await send(http.get('/api/v1/health'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'up', redis: 'up' });
  });

  it('logs in, stores only the refresh hash, and resolves the current principal', async () => {
    const login = await loginAs(adminEmail);
    const cookie = getRefreshCookie(login.headers['set-cookie']);
    const rawToken = cookieValue(cookie);
    const storedSession = await prisma.refreshSession.findFirstOrThrow({
      where: { userId: adminId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    expect(login.status).toBe(200);
    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).not.toContain('Secure');
    expect(storedSession.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedSession.tokenHash).not.toBe(rawToken);
    expect(login.body).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(login.body)).not.toContain(rawToken);

    const me = await send(
      http.get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`),
    );
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      id: adminId,
      email: adminEmail,
      memberships: [{ organizationId: organizationAId, role: Role.SCHOOL_ADMIN }],
    });
  });

  it('enforces organization membership and role on the backend', async () => {
    const adminLogin = await loginAs(adminEmail);
    const ownerLogin = await loginAs(ownerEmail);

    const adminOwnOrganization = await authorizedGet(
      `/api/v1/test/organizations/${organizationAId}/member`,
      adminLogin.body.accessToken,
    );
    const adminOtherOrganization = await authorizedGet(
      `/api/v1/test/organizations/${organizationBId}/member`,
      adminLogin.body.accessToken,
    );
    const adminOwnerAction = await authorizedGet(
      `/api/v1/test/organizations/${organizationAId}/owner`,
      adminLogin.body.accessToken,
    );
    const ownerAction = await authorizedGet(
      `/api/v1/test/organizations/${organizationAId}/owner`,
      ownerLogin.body.accessToken,
    );

    expect(adminOwnOrganization.status).toBe(200);
    expect(adminOtherOrganization.status).toBe(403);
    expect(adminOtherOrganization.body.error.code).toBe('ORGANIZATION_ACCESS_DENIED');
    expect(adminOwnerAction.status).toBe(403);
    expect(adminOwnerAction.body.error.code).toBe('ROLE_ACCESS_DENIED');
    expect(ownerAction.status).toBe(200);

    await prisma.membership.update({
      where: {
        organizationId_userId: { organizationId: organizationAId, userId: adminId },
      },
      data: { role: Role.PROJECT_OWNER },
    });
    const actionAfterRoleChange = await authorizedGet(
      `/api/v1/test/organizations/${organizationAId}/owner`,
      adminLogin.body.accessToken,
    );
    expect(actionAfterRoleChange.status).toBe(200);
    await prisma.membership.update({
      where: {
        organizationId_userId: { organizationId: organizationAId, userId: adminId },
      },
      data: { role: Role.SCHOOL_ADMIN },
    });

    await prisma.membership.update({
      where: {
        organizationId_userId: { organizationId: organizationAId, userId: adminId },
      },
      data: { isActive: false },
    });
    const actionWithInactiveMembership = await authorizedGet(
      `/api/v1/test/organizations/${organizationAId}/member`,
      adminLogin.body.accessToken,
    );
    expect(actionWithInactiveMembership.status).toBe(403);
    expect(actionWithInactiveMembership.body.error.code).toBe('ORGANIZATION_ACCESS_DENIED');
    await prisma.membership.update({
      where: {
        organizationId_userId: { organizationId: organizationAId, userId: adminId },
      },
      data: { isActive: true },
    });
  });

  it('rejects a disabled user and records a sanitized failed-login audit event', async () => {
    const response = await loginAs(disabledEmail);

    expect(response.status).toBe(401);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { requestId: response.headers['x-request-id'] as string },
    });
    expect(audit.actorId).toBeNull();
    expect(audit.metadata).toMatchObject({ reason: 'USER_DISABLED' });
    expect(JSON.stringify(audit.metadata)).not.toContain(disabledEmail);
    expect(JSON.stringify(audit.metadata)).not.toContain(password);
  });

  it('rotates refresh tokens and revokes the complete family when an old token is reused', async () => {
    const login = await loginAs(ownerEmail);
    const originalCookie = getRefreshCookie(login.headers['set-cookie']);
    const originalRawToken = cookieValue(originalCookie);
    const parentSession = await sessionForCookie(originalCookie);
    const refreshed = await send(http.post('/api/v1/auth/refresh').set('Cookie', originalCookie));
    const rotatedCookie = getRefreshCookie(refreshed.headers['set-cookie']);
    const rotatedRawToken = cookieValue(rotatedCookie);
    const childSession = await sessionForCookie(rotatedCookie);
    const rotatedParent = await prisma.refreshSession.findUniqueOrThrow({
      where: { id: parentSession.id },
    });

    expect(refreshed.status).toBe(200);
    expect(rotatedCookie).not.toBe(originalCookie);
    expect(refreshed.body).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(refreshed.body)).not.toContain(originalRawToken);
    expect(JSON.stringify(refreshed.body)).not.toContain(rotatedRawToken);
    expect(rotatedParent.replacedById).toBe(childSession.id);
    expect(childSession.sessionFamilyId).toBe(parentSession.sessionFamilyId);
    expect(childSession.tokenHash).not.toBe(rotatedRawToken);

    const oldAccess = await authorizedGet('/api/v1/auth/me', login.body.accessToken);
    const currentAccess = await authorizedGet('/api/v1/auth/me', refreshed.body.accessToken);
    expect(oldAccess.status).toBe(401);
    expect(currentAccess.status).toBe(200);

    const replay = await send(http.post('/api/v1/auth/refresh').set('Cookie', originalCookie));
    const accessAfterReplay = await authorizedGet('/api/v1/auth/me', refreshed.body.accessToken);
    expect(replay.status).toBe(401);
    expect(accessAfterReplay.status).toBe(401);

    const reuseAudit = await prisma.auditLog.findFirst({
      where: {
        requestId: { startsWith: requestPrefix },
        eventType: 'AUTH_REFRESH_REUSE_DETECTED',
      },
    });
    expect(reuseAudit).not.toBeNull();
    expect(
      await prisma.refreshSession.count({
        where: { sessionFamilyId: parentSession.sessionFamilyId, revokedAt: null },
      }),
    ).toBe(0);
  });

  it('allows the configured or absent Origin and rejects untrusted cookie origins', async () => {
    const login = await loginAs(adminEmail);
    const originalCookie = getRefreshCookie(login.headers['set-cookie']);

    const untrustedRefresh = await send(
      http
        .post('/api/v1/auth/refresh')
        .set('Origin', 'https://attacker.example.invalid')
        .set('Cookie', originalCookie),
    );
    expect(untrustedRefresh.status).toBe(403);
    expect(untrustedRefresh.body.error.code).toBe('ORIGIN_NOT_ALLOWED');

    const allowedRefresh = await send(
      http
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', originalCookie),
    );
    expect(allowedRefresh.status).toBe(200);
    const firstRotatedCookie = getRefreshCookie(allowedRefresh.headers['set-cookie']);

    const refreshWithoutOrigin = await send(
      http.post('/api/v1/auth/refresh').set('Cookie', firstRotatedCookie),
    );
    expect(refreshWithoutOrigin.status).toBe(200);
    const secondRotatedCookie = getRefreshCookie(refreshWithoutOrigin.headers['set-cookie']);

    const refreshWithoutCookie = await send(
      http.post('/api/v1/auth/refresh').set('Origin', 'http://localhost:3000'),
    );
    expect(refreshWithoutCookie.status).toBe(401);
    expect(refreshWithoutCookie.body.error.code).toBe('REFRESH_TOKEN_REQUIRED');

    const untrustedLogout = await send(
      http
        .post('/api/v1/auth/logout')
        .set('Origin', 'https://attacker.example.invalid')
        .set('Cookie', secondRotatedCookie),
    );
    expect(untrustedLogout.status).toBe(403);
    expect(untrustedLogout.body.error.code).toBe('ORIGIN_NOT_ALLOWED');

    const logoutWithoutOrigin = await send(
      http.post('/api/v1/auth/logout').set('Cookie', secondRotatedCookie),
    );
    expect(logoutWithoutOrigin.status).toBe(204);
  });

  it('permits only one concurrent rotation and revokes the family after replay detection', async () => {
    const login = await loginAs(ownerEmail);
    const parentCookie = getRefreshCookie(login.headers['set-cookie']);
    const parentSession = await sessionForCookie(parentCookie);

    const responses = await Promise.all([
      send(http.post('/api/v1/auth/refresh').set('Cookie', parentCookie)),
      send(http.post('/api/v1/auth/refresh').set('Cookie', parentCookie)),
    ]);
    const statuses = responses
      .map((response) => response.status)
      .sort((left, right) => left - right);
    const family = await prisma.refreshSession.findMany({
      where: { sessionFamilyId: parentSession.sessionFamilyId },
      orderBy: { createdAt: 'asc' },
    });
    const reloadedParent = family.find((session) => session.id === parentSession.id);
    const children = family.filter((session) => session.id !== parentSession.id);
    const successfulResponse = responses.find((response) => response.status === 200);

    expect(statuses).toEqual([200, 401]);
    expect(responses.every((response) => response.status !== 500)).toBe(true);
    expect(children).toHaveLength(1);
    expect(reloadedParent?.replacedById).toBe(children[0]?.id);
    expect(children[0]?.sessionFamilyId).toBe(parentSession.sessionFamilyId);
    expect(family.filter((session) => session.revokedAt === null)).toHaveLength(0);
    expect(successfulResponse?.body).not.toHaveProperty('refreshToken');

    const accessAfterConcurrentReplay = await authorizedGet(
      '/api/v1/auth/me',
      successfulResponse?.body.accessToken as string,
    );
    expect(accessAfterConcurrentReplay.status).toBe(401);
  });

  it('rejects expired and explicitly revoked refresh sessions', async () => {
    const expiredLogin = await loginAs(ownerEmail);
    const expiredCookie = getRefreshCookie(expiredLogin.headers['set-cookie']);
    const expiredSession = await sessionForCookie(expiredCookie);
    await prisma.refreshSession.update({
      where: { id: expiredSession.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const expiredResponse = await send(
      http.post('/api/v1/auth/refresh').set('Cookie', expiredCookie),
    );
    expect(expiredResponse.status).toBe(401);
    expect(
      await prisma.refreshSession.count({
        where: { sessionFamilyId: expiredSession.sessionFamilyId, revokedAt: null },
      }),
    ).toBe(0);

    const revokedLogin = await loginAs(ownerEmail);
    const revokedCookie = getRefreshCookie(revokedLogin.headers['set-cookie']);
    const revokedSession = await sessionForCookie(revokedCookie);
    await prisma.refreshSession.update({
      where: { id: revokedSession.id },
      data: { revokedAt: new Date() },
    });
    const revokedResponse = await send(
      http.post('/api/v1/auth/refresh').set('Cookie', revokedCookie),
    );
    expect(revokedResponse.status).toBe(401);
    expect(revokedResponse.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('revokes the server-side session on logout', async () => {
    const login = await loginAs(adminEmail);
    const cookie = getRefreshCookie(login.headers['set-cookie']);
    const session = await sessionForCookie(cookie);
    const logout = await send(http.post('/api/v1/auth/logout').set('Cookie', cookie));
    const me = await authorizedGet('/api/v1/auth/me', login.body.accessToken);
    const revokedSession = await prisma.refreshSession.findUniqueOrThrow({
      where: { id: session.id },
    });

    expect(logout.status).toBe(204);
    expect(logout.headers['set-cookie']?.[0]).toContain('Expires=Thu, 01 Jan 1970');
    expect(revokedSession.revokedAt).not.toBeNull();
    expect(me.status).toBe(401);
  });

  it('rejects an existing session immediately after the user is disabled', async () => {
    const login = await loginAs(ownerEmail);
    const cookie = getRefreshCookie(login.headers['set-cookie']);
    await prisma.user.update({ where: { id: ownerId }, data: { isActive: false } });

    try {
      const me = await authorizedGet('/api/v1/auth/me', login.body.accessToken);
      const refresh = await send(http.post('/api/v1/auth/refresh').set('Cookie', cookie));

      expect(me.status).toBe(401);
      expect(refresh.status).toBe(401);
    } finally {
      await prisma.user.update({ where: { id: ownerId }, data: { isActive: true } });
    }
  });

  it('rate limits repeated login attempts without globally enabling postinstall scripts', async () => {
    setTestEnvironment(2);
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const rateLimitedApp = module.createNestApplication<NestExpressApplication>();
    configureApp(rateLimitedApp);
    await rateLimitedApp.init();
    const rateHttp = request(rateLimitedApp.getHttpServer());

    try {
      const first = await send(
        rateHttp.post('/api/v1/auth/login').send({ email: 'none@example.invalid', password }),
      );
      const second = await send(
        rateHttp.post('/api/v1/auth/login').send({ email: 'none@example.invalid', password }),
      );
      const third = await send(
        rateHttp.post('/api/v1/auth/login').send({ email: 'none@example.invalid', password }),
      );

      expect(first.status).toBe(401);
      expect(second.status).toBe(401);
      expect(third.status).toBe(429);
      expect(third.body.error.code).toBe('RATE_LIMITED');
    } finally {
      await rateLimitedApp.close();
    }
  }, 30_000);

  async function loginAs(email: string): Promise<SuperTestResponse> {
    return send(http.post('/api/v1/auth/login').send({ email, password }));
  }

  async function authorizedGet(path: string, token: string): Promise<SuperTestResponse> {
    return send(http.get(path).set('Authorization', `Bearer ${token}`));
  }

  function sessionForCookie(cookie: string) {
    return prisma.refreshSession.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(cookieValue(cookie)) },
    });
  }

  function send(agent: SuperTestRequest): Promise<SuperTestResponse> {
    requestSequence += 1;
    return agent.set('x-request-id', `${requestPrefix}-${requestSequence}`);
  }
});

function setTestEnvironment(loginRateLimitMax: number): void {
  process.env.NODE_ENV = 'test';
  process.env.WEB_URL = 'http://localhost:3000';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.AUTH_ACCESS_TOKEN_SECRET = 'integration-only-access-secret-at-least-32-chars';
  process.env.AUTH_JWT_ISSUER = 'siagalongsor-api-test';
  process.env.AUTH_JWT_AUDIENCE = 'siagalongsor-web-test';
  process.env.AUTH_LOGIN_RATE_LIMIT_MAX = String(loginRateLimitMax);
  process.env.AUTH_LOGIN_RATE_LIMIT_TTL_MS = '60000';
}

function userData(
  id: string,
  email: string,
  name: string,
  passwordHash: string,
  isActive: boolean,
): {
  id: string;
  email: string;
  normalizedEmail: string;
  name: string;
  passwordHash: string;
  isActive: boolean;
} {
  return {
    id,
    email,
    normalizedEmail: email.toLowerCase(),
    name,
    passwordHash,
    isActive,
  };
}

function getRefreshCookie(setCookie: string | string[] | undefined): string {
  const values = typeof setCookie === 'string' ? [setCookie] : setCookie;
  const cookie = values?.find((value) => value.startsWith('siagalongsor_refresh='));
  if (cookie === undefined) {
    throw new Error('Refresh cookie not found');
  }
  return cookie;
}

function cookieValue(cookie: string): string {
  return cookie.split(';', 1)[0]?.split('=', 2)[1] ?? '';
}

function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
