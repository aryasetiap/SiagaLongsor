import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
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
import { DeviceLifecycleStatus, Role } from '../generated/prisma/enums.js';

describe('MonitoringPoint API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let ownerToken: string;
  let adminToken: string;

  const testRunId = randomUUID();
  const requestPrefix = `monitoring-point-e2e-${testRunId}`;
  const organizationAId = `mp-org-a-${testRunId}`;
  const organizationBId = `mp-org-b-${testRunId}`;
  const siteAId = `mp-site-a-${testRunId}`;
  const siteBId = `mp-site-b-${testRunId}`;
  const ownerId = `mp-owner-${testRunId}`;
  const adminId = `mp-admin-${testRunId}`;
  const ownerEmail = `mp-owner-${testRunId}@example.invalid`;
  const adminEmail = `mp-admin-${testRunId}@example.invalid`;
  const password = `Monitoring-point-password-${randomUUID()}`;
  let requestSequence = 0;

  beforeAll(async () => {
    setTestEnvironment();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'Monitoring Point Organization A', slug: `mp-a-${testRunId}` },
        { id: organizationBId, name: 'Monitoring Point Organization B', slug: `mp-b-${testRunId}` },
      ],
    });
    await prisma.site.createMany({
      data: [
        { id: siteAId, organizationId: organizationAId, name: 'Site A', slug: 'site-a' },
        { id: siteBId, organizationId: organizationBId, name: 'Site B', slug: 'site-b' },
      ],
    });
    await prisma.user.createMany({
      data: [
        userData(ownerId, ownerEmail, 'Monitoring Point Owner', passwordHash),
        userData(adminId, adminEmail, 'Monitoring Point Admin', passwordHash),
      ],
    });
    await prisma.membership.createMany({
      data: [
        { organizationId: organizationAId, userId: ownerId, role: Role.PROJECT_OWNER },
        { organizationId: organizationAId, userId: adminId, role: Role.SCHOOL_ADMIN },
      ],
    });

    ownerToken = await login(ownerEmail);
    adminToken = await login(adminEmail);
  }, 30_000);

  afterAll(async () => {
    if (prisma !== undefined) {
      await prisma.auditLog.deleteMany({
        where: { OR: [{ organizationId: organizationAId }, { organizationId: organizationBId }] },
      });
      await prisma.refreshSession.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
      await prisma.device.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.monitoringPoint.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, adminId] } } });
      await prisma.site.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationAId, organizationBId] } },
      });
    }
    await app?.close();
  });

  it('requires X-Organization-Id', async () => {
    const response = await send(
      http.get('/api/v1/monitoring-points').set('Authorization', `Bearer ${ownerToken}`),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ORGANIZATION_CONTEXT_REQUIRED');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('allows X-Organization-Id in CORS preflight only for the configured origin', async () => {
    const response = await send(
      http
        .options('/api/v1/monitoring-points')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'X-Organization-Id'),
    );

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
    expect(response.headers['access-control-allow-headers']).toContain('X-Organization-Id');
  });

  it('rejects an organization without active membership', async () => {
    const response = await getList(ownerToken, organizationBId);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORGANIZATION_ACCESS_DENIED');
  });

  it('allows PROJECT_OWNER to create a monitoring point and writes a safe audit log', async () => {
    const response = await createPoint(ownerToken, {
      siteId: siteAId,
      name: '  Lereng Utama  ',
      description: 'Area pemantauan utama.',
      locationDescription: 'Belakang gedung.',
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      organizationId: organizationAId,
      siteId: siteAId,
      name: 'Lereng Utama',
      isActive: true,
      currentDevice: null,
    });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        requestId: response.headers['x-request-id'] as string,
        eventType: 'MONITORING_POINT_CREATED',
      },
    });
    const serialized = JSON.stringify(audit.metadata);
    expect(audit.actorId).toBe(ownerId);
    expect(audit.entityId).toBe(response.body.data.id);
    expect(serialized).not.toContain(ownerToken);
    expect(serialized).not.toContain('credentialHash');
    expect(serialized).not.toContain('secret');
  });

  it('rejects SCHOOL_ADMIN create with ROLE_ACCESS_DENIED', async () => {
    const response = await createPoint(adminToken, {
      siteId: siteAId,
      name: 'Admin Cannot Create',
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_ACCESS_DENIED');
  });

  it('allows both roles to list and read details', async () => {
    const point = await directPoint('Readable Point');
    const [ownerList, adminList, ownerDetail, adminDetail] = await Promise.all([
      getList(ownerToken, organizationAId, `search=${encodeURIComponent(point.name)}`),
      getList(adminToken, organizationAId, `search=${encodeURIComponent(point.name)}`),
      getDetail(ownerToken, organizationAId, point.id),
      getDetail(adminToken, organizationAId, point.id),
    ]);

    expect(ownerList.status).toBe(200);
    expect(adminList.status).toBe(200);
    expect(ownerDetail.status).toBe(200);
    expect(adminDetail.status).toBe(200);
    expect(ownerList.body.data).toHaveLength(1);
    expect(adminDetail.body.data.id).toBe(point.id);
  });

  it('hides cross-organization resources as not found', async () => {
    const point = await directPoint('Other Organization Point', organizationBId, siteBId);
    const response = await getDetail(ownerToken, organizationAId, point.id);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('MONITORING_POINT_NOT_FOUND');
  });

  it('rejects a cross-organization site on create', async () => {
    const response = await createPoint(ownerToken, {
      siteId: siteBId,
      name: 'Invalid Site Scope',
    });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('SITE_NOT_FOUND');
  });

  it('validates and rejects unknown create properties', async () => {
    const response = await createPoint(ownerToken, {
      siteId: siteAId,
      name: ' ',
      unexpected: true,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(expect.any(Array));
  });

  it('updates fields atomically and records safe before/after audit metadata', async () => {
    const point = await directPoint('Before Update');
    const response = await updatePoint(ownerToken, point.id, {
      name: '  After Update  ',
      description: 'Updated description',
      locationDescription: null,
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      name: 'After Update',
      description: 'Updated description',
      locationDescription: null,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        requestId: response.headers['x-request-id'] as string,
        eventType: 'MONITORING_POINT_UPDATED',
      },
    });
    expect(audit.metadata).toMatchObject({
      before: { name: 'Before Update' },
      after: { name: 'After Update' },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain('credentialHash');
  });

  it('does not create audit noise for an unchanged update', async () => {
    const point = await directPoint('No-op Update');
    const response = await updatePoint(ownerToken, point.id, { name: point.name });

    expect(response.status).toBe(200);
    expect(
      await prisma.auditLog.count({
        where: { requestId: response.headers['x-request-id'] as string },
      }),
    ).toBe(0);
  });

  it('rejects SCHOOL_ADMIN update', async () => {
    const point = await directPoint('Admin Cannot Update');
    const response = await updatePoint(adminToken, point.id, { name: 'Denied' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_ACCESS_DENIED');
  });

  it('rejects empty, siteId, unknown, and null-prohibited PATCH values', async () => {
    const point = await directPoint('Patch Validation');
    const responses = await Promise.all([
      updatePoint(ownerToken, point.id, {}),
      updatePoint(ownerToken, point.id, { siteId: siteAId }),
      updatePoint(ownerToken, point.id, { unknown: true }),
      updatePoint(ownerToken, point.id, { name: null }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400]);
    expect(responses.every((response) => response.body.error.code === 'VALIDATION_ERROR')).toBe(
      true,
    );
  });

  it('deactivates a monitoring point without an enabled device', async () => {
    const point = await directPoint('Can Deactivate');
    const response = await updatePoint(ownerToken, point.id, { isActive: false });

    expect(response.status).toBe(200);
    expect(response.body.data.isActive).toBe(false);
  });

  it('rejects deactivation when an enabled device exists', async () => {
    const point = await directPoint('Active Device Conflict');
    await directDevice(point.id, DeviceLifecycleStatus.ENABLED, 'ENABLED-CONFLICT');
    const response = await updatePoint(ownerToken, point.id, { isActive: false });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('MONITORING_POINT_ACTIVE_DEVICE_CONFLICT');
  });

  it('applies default and maximum pagination limits without totalCount', async () => {
    const prefix = `Pagination ${testRunId}`;
    await prisma.monitoringPoint.createMany({
      data: Array.from({ length: 26 }, (_value, index) => ({
        organizationId: organizationAId,
        siteId: siteAId,
        name: `${prefix} ${String(index).padStart(2, '0')}`,
      })),
    });

    const defaultPage = await getList(
      ownerToken,
      organizationAId,
      `search=${encodeURIComponent(prefix)}&sort=name:asc`,
    );
    const maximumPage = await getList(
      ownerToken,
      organizationAId,
      `search=${encodeURIComponent(prefix)}&limit=100`,
    );
    const tooLarge = await getList(ownerToken, organizationAId, 'limit=101');

    expect(defaultPage.status).toBe(200);
    expect(defaultPage.body.data).toHaveLength(25);
    expect(defaultPage.body.page.hasMore).toBe(true);
    expect(defaultPage.body).not.toHaveProperty('totalCount');
    expect(maximumPage.body.data).toHaveLength(26);
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('uses an opaque stable cursor without duplicate rows', async () => {
    const prefix = `Cursor ${randomUUID()}`;
    const points = await Promise.all([
      directPoint(`${prefix} A`),
      directPoint(`${prefix} B`),
      directPoint(`${prefix} C`),
    ]);
    const query = `search=${encodeURIComponent(prefix)}&sort=name:asc&limit=2`;
    const first = await getList(ownerToken, organizationAId, query);
    const second = await getList(
      ownerToken,
      organizationAId,
      `${query}&cursor=${encodeURIComponent(first.body.page.nextCursor as string)}`,
    );
    const ids = [...first.body.data, ...second.body.data].map((point: { id: string }) => point.id);

    expect(first.body.page.hasMore).toBe(true);
    expect(second.body.page.hasMore).toBe(false);
    expect(new Set(ids).size).toBe(3);
    expect(ids.sort()).toEqual(points.map((point) => point.id).sort());
  });

  it('rejects malformed and tampered cursors', async () => {
    const response = await getList(ownerToken, organizationAId, 'cursor=not-a-valid-cursor');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CURSOR');
  });

  it('rejects cursor reuse with different filters or sort', async () => {
    const prefix = `Bound Cursor ${randomUUID()}`;
    await Promise.all([
      directPoint(`${prefix} A`),
      directPoint(`${prefix} B`),
      directPoint(`${prefix} C`),
    ]);
    const first = await getList(
      ownerToken,
      organizationAId,
      `search=${encodeURIComponent(prefix)}&sort=name:asc&limit=1`,
    );
    const cursor = encodeURIComponent(first.body.page.nextCursor as string);
    const [differentFilter, differentSort] = await Promise.all([
      getList(
        ownerToken,
        organizationAId,
        `search=${encodeURIComponent(`${prefix} A`)}&sort=name:asc&limit=1&cursor=${cursor}`,
      ),
      getList(
        ownerToken,
        organizationAId,
        `search=${encodeURIComponent(prefix)}&sort=name:desc&limit=1&cursor=${cursor}`,
      ),
    ]);

    expect(differentFilter.status).toBe(400);
    expect(differentFilter.body.error.code).toBe('INVALID_CURSOR');
    expect(differentSort.status).toBe(400);
    expect(differentSort.body.error.code).toBe('INVALID_CURSOR');
  });

  it('supports search across fields plus site, active, and stable sorting filters', async () => {
    const marker = `filter-${testRunId}`;
    await prisma.monitoringPoint.createMany({
      data: [
        {
          organizationId: organizationAId,
          siteId: siteAId,
          name: `Zulu ${marker}`,
          description: 'ordinary',
          isActive: true,
        },
        {
          organizationId: organizationAId,
          siteId: siteAId,
          name: `Alpha ${marker}`,
          locationDescription: `location ${marker}`,
          isActive: true,
        },
        {
          organizationId: organizationAId,
          siteId: siteAId,
          name: `Inactive ${marker}`,
          description: marker,
          isActive: false,
        },
      ],
    });
    const response = await getList(
      ownerToken,
      organizationAId,
      `siteId=${encodeURIComponent(siteAId)}&isActive=true&search=${encodeURIComponent(
        marker,
      )}&sort=name:asc`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.map((point: { name: string }) => point.name)).toEqual([
      `Alpha ${marker}`,
      `Zulu ${marker}`,
    ]);
  });

  it('returns only the enabled currentDevice and never exposes credentials', async () => {
    const point = await directPoint('Current Device Summary');
    await directDevice(point.id, DeviceLifecycleStatus.DISABLED, 'DISABLED-SUMMARY');
    const enabled = await directDevice(point.id, DeviceLifecycleStatus.ENABLED, 'ENABLED-SUMMARY');
    const response = await getDetail(ownerToken, organizationAId, point.id);
    const serialized = JSON.stringify(response.body);

    expect(response.status).toBe(200);
    expect(response.body.data.currentDevice).toEqual({
      id: enabled.id,
      hardwareId: enabled.hardwareId,
      displayName: enabled.displayName,
      lifecycleStatus: DeviceLifecycleStatus.ENABLED,
      lastSeenAt: null,
    });
    expect(serialized).not.toContain('credentialHash');
    expect(serialized).not.toContain('secret');
  });

  async function login(email: string): Promise<string> {
    const response = await send(http.post('/api/v1/auth/login').send({ email, password }));
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  function getList(token: string, organizationId: string, query = '') {
    return authorized(
      http.get(`/api/v1/monitoring-points${query.length === 0 ? '' : `?${query}`}`),
      token,
      organizationId,
    );
  }

  function getDetail(token: string, organizationId: string, pointId: string) {
    return authorized(http.get(`/api/v1/monitoring-points/${pointId}`), token, organizationId);
  }

  function createPoint(token: string, body: Record<string, unknown>) {
    return authorized(http.post('/api/v1/monitoring-points').send(body), token, organizationAId);
  }

  function updatePoint(token: string, pointId: string, body: Record<string, unknown>) {
    return authorized(
      http.patch(`/api/v1/monitoring-points/${pointId}`).send(body),
      token,
      organizationAId,
    );
  }

  function authorized(agent: SuperTestRequest, token: string, organizationId: string) {
    return send(
      agent.set('Authorization', `Bearer ${token}`).set('X-Organization-Id', organizationId),
    );
  }

  function send(agent: SuperTestRequest): Promise<SuperTestResponse> {
    requestSequence += 1;
    return agent.set('x-request-id', `${requestPrefix}-${requestSequence}`);
  }

  function directPoint(name: string, organizationId = organizationAId, siteId = siteAId) {
    return prisma.monitoringPoint.create({ data: { organizationId, siteId, name } });
  }

  function directDevice(
    monitoringPointId: string,
    lifecycleStatus: DeviceLifecycleStatus,
    hardwarePrefix: string,
  ) {
    return prisma.device.create({
      data: {
        organizationId: organizationAId,
        siteId: siteAId,
        monitoringPointId,
        hardwareId: `${hardwarePrefix}-${testRunId}`.toUpperCase(),
        displayName: hardwarePrefix,
        lifecycleStatus,
        disabledAt: lifecycleStatus === DeviceLifecycleStatus.DISABLED ? new Date() : null,
        credentialHash: '$argon2id$integration-hash-only',
      },
    });
  }
});

function setTestEnvironment(): void {
  process.env.NODE_ENV = 'test';
  process.env.WEB_URL = 'http://localhost:3000';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.AUTH_ACCESS_TOKEN_SECRET = 'integration-only-access-secret-at-least-32-chars';
  process.env.AUTH_JWT_ISSUER = 'siagalongsor-api-test';
  process.env.AUTH_JWT_AUDIENCE = 'siagalongsor-web-test';
  process.env.AUTH_LOGIN_RATE_LIMIT_MAX = '100';
  process.env.AUTH_LOGIN_RATE_LIMIT_TTL_MS = '60000';
}

function userData(
  id: string,
  email: string,
  name: string,
  passwordHash: string,
): {
  id: string;
  email: string;
  normalizedEmail: string;
  name: string;
  passwordHash: string;
} {
  return {
    id,
    email,
    normalizedEmail: email.toLowerCase(),
    name,
    passwordHash,
  };
}
