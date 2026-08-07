import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request, {
  type Response as SuperTestResponse,
  type Test as SuperTestRequest,
} from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { configureApp } from '../bootstrap/configure-app.js';
import { PrismaService } from '../database/prisma.service.js';
import { DeviceLifecycleStatus, NetworkType, Role } from '../generated/prisma/enums.js';
import { DeviceCredentialService } from './device-credential.service.js';

describe('Device and credential API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let credentialService: DeviceCredentialService;
  let http: ReturnType<typeof request>;
  let ownerToken: string;
  let adminToken: string;

  const testRunId = randomUUID();
  const requestPrefix = `device-e2e-${testRunId}`;
  const organizationAId = `device-org-a-${testRunId}`;
  const organizationBId = `device-org-b-${testRunId}`;
  const siteAId = `device-site-a-${testRunId}`;
  const siteBId = `device-site-b-${testRunId}`;
  const ownerId = `device-owner-${testRunId}`;
  const adminId = `device-admin-${testRunId}`;
  const ownerEmail = `device-owner-${testRunId}@example.invalid`;
  const adminEmail = `device-admin-${testRunId}@example.invalid`;
  const password = `Device-password-${randomUUID()}`;
  let requestSequence = 0;
  let entitySequence = 0;

  beforeAll(async () => {
    setTestEnvironment();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaService);
    credentialService = app.get(DeviceCredentialService);
    http = request(app.getHttpServer());

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'Device Organization A', slug: `device-a-${testRunId}` },
        { id: organizationBId, name: 'Device Organization B', slug: `device-b-${testRunId}` },
      ],
    });
    await prisma.site.createMany({
      data: [
        { id: siteAId, organizationId: organizationAId, name: 'Device Site A', slug: 'site-a' },
        { id: siteBId, organizationId: organizationBId, name: 'Device Site B', slug: 'site-b' },
      ],
    });
    await prisma.user.createMany({
      data: [
        userData(ownerId, ownerEmail, 'Device Owner', passwordHash),
        userData(adminId, adminEmail, 'Device Admin', passwordHash),
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
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.refreshSession.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
      await prisma.currentMonitoringPointState.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.telemetry.deleteMany({
        where: { device: { organizationId: { in: [organizationAId, organizationBId] } } },
      });
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

  it('requires an organization context and active membership', async () => {
    const [missingHeader, otherOrganization] = await Promise.all([
      send(http.get('/api/v1/devices').set('Authorization', `Bearer ${ownerToken}`)),
      list(ownerToken, organizationBId),
    ]);

    expect(missingHeader.status).toBe(400);
    expect(missingHeader.body.error.code).toBe('ORGANIZATION_CONTEXT_REQUIRED');
    expect(otherOrganization.status).toBe(403);
    expect(otherOrganization.body.error.code).toBe('ORGANIZATION_ACCESS_DENIED');
  });

  it('registers an enabled device and returns its credential exactly once', async () => {
    const point = await directPoint();
    const response = await register(ownerToken, {
      hardwareId: hardwareId('REGISTER'),
      displayName: '  Sensor Lereng Utama  ',
      monitoringPointId: point.id,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.device).toMatchObject({
      organizationId: organizationAId,
      siteId: siteAId,
      monitoringPointId: point.id,
      displayName: 'Sensor Lereng Utama',
      lifecycleStatus: DeviceLifecycleStatus.ENABLED,
    });
    expect(response.body.data.credential).toMatchObject({
      scheme: 'Device',
      hardwareId: response.body.data.device.hardwareId,
      displayOnce: true,
    });
    expect(response.body.data.credential.secret).toEqual(expect.any(String));
    expect(response.body.data.credential.secret.length).toBeGreaterThanOrEqual(32);
    expect(JSON.stringify(response.body).match(/"secret"/g)).toHaveLength(1);

    const stored = await prisma.device.findUniqueOrThrow({
      where: { id: response.body.data.device.id as string },
    });
    expect(stored.credentialHash).not.toBe(response.body.data.credential.secret);
    expect(
      await credentialService.verify(response.body.data.credential.secret, stored.credentialHash),
    ).toBe(true);
  });

  it('never exposes a secret or credential hash through list and detail', async () => {
    const point = await directPoint();
    const registered = await register(ownerToken, {
      hardwareId: hardwareId('READSAFE'),
      displayName: 'Safe Read Device',
      monitoringPointId: point.id,
    });
    const deviceId = registered.body.data.device.id as string;
    const [detail, devices] = await Promise.all([
      get(ownerToken, organizationAId, deviceId),
      list(ownerToken, organizationAId, 'search=Safe%20Read%20Device'),
    ]);

    for (const response of [detail, devices]) {
      const serialized = JSON.stringify(response.body);
      expect(response.status).toBe(200);
      expect(serialized).not.toContain('credentialHash');
      expect(serialized).not.toContain(registered.body.data.credential.secret);
      expect(serialized).not.toContain('"secret"');
    }
  });

  it('writes sanitized registration audit metadata', async () => {
    const point = await directPoint();
    const response = await register(ownerToken, {
      hardwareId: hardwareId('AUDITREG'),
      displayName: 'Audited Device',
      monitoringPointId: point.id,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        requestId: response.headers['x-request-id'] as string,
        eventType: 'DEVICE_REGISTERED',
      },
    });
    const serialized = JSON.stringify(audit.metadata);

    expect(audit.actorId).toBe(ownerId);
    expect(audit.entityId).toBe(response.body.data.device.id);
    expect(serialized).not.toContain(response.body.data.credential.secret);
    expect(serialized).not.toContain('credentialHash');
    expect(serialized).not.toContain('"secret"');
  });

  it('allows both roles to read but only PROJECT_OWNER to mutate', async () => {
    const point = await directPoint();
    const device = await directDevice(point.id, DeviceLifecycleStatus.ENABLED);
    const [ownerList, adminList, adminDetail, adminCreate, adminUpdate, adminRotate, adminDisable] =
      await Promise.all([
        list(ownerToken, organizationAId),
        list(adminToken, organizationAId),
        get(adminToken, organizationAId, device.id),
        register(adminToken, {
          hardwareId: hardwareId('ADMIN'),
          displayName: 'Denied',
          monitoringPointId: (await directPoint()).id,
        }),
        update(adminToken, device.id, { displayName: 'Denied' }),
        rotate(adminToken, device.id),
        disable(adminToken, device.id),
      ]);

    expect([ownerList.status, adminList.status, adminDetail.status]).toEqual([200, 200, 200]);
    expect(
      [adminCreate, adminUpdate, adminRotate, adminDisable].map((item) => item.status),
    ).toEqual([403, 403, 403, 403]);
    expect(
      [adminCreate, adminUpdate, adminRotate, adminDisable].every(
        (item) => item.body.error.code === 'ROLE_ACCESS_DENIED',
      ),
    ).toBe(true);
  });

  it('hides cross-organization devices and monitoring points', async () => {
    const otherPoint = await directPoint(organizationBId, siteBId);
    const otherDevice = await directDevice(
      otherPoint.id,
      DeviceLifecycleStatus.ENABLED,
      organizationBId,
      siteBId,
    );
    const [detail, create] = await Promise.all([
      get(ownerToken, organizationAId, otherDevice.id),
      register(ownerToken, {
        hardwareId: hardwareId('CROSSORG'),
        displayName: 'Cross Organization',
        monitoringPointId: otherPoint.id,
      }),
    ]);

    expect(detail.status).toBe(404);
    expect(detail.body.error.code).toBe('DEVICE_NOT_FOUND');
    expect(create.status).toBe(404);
    expect(create.body.error.code).toBe('MONITORING_POINT_NOT_FOUND');
  });

  it('rejects an inactive monitoring point', async () => {
    const point = await directPoint(organizationAId, siteAId, false);
    const response = await register(ownerToken, {
      hardwareId: hardwareId('INACTIVE'),
      displayName: 'Inactive Point Device',
      monitoringPointId: point.id,
    });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('MONITORING_POINT_NOT_FOUND');
  });

  it('rejects duplicate hardwareId globally', async () => {
    const hardware = hardwareId('DUPLICATE');
    await directDevice(
      (await directPoint()).id,
      DeviceLifecycleStatus.ENABLED,
      undefined,
      undefined,
      {
        hardwareId: hardware,
      },
    );
    const response = await register(ownerToken, {
      hardwareId: hardware,
      displayName: 'Duplicate Hardware',
      monitoringPointId: (await directPoint()).id,
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('HARDWARE_ID_CONFLICT');
  });

  it('allows only one enabled device per monitoring point', async () => {
    const point = await directPoint();
    await directDevice(point.id, DeviceLifecycleStatus.ENABLED);
    const response = await register(ownerToken, {
      hardwareId: hardwareId('OCCUPIED'),
      displayName: 'Occupied Point',
      monitoringPointId: point.id,
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('MONITORING_POINT_ACTIVE_DEVICE_CONFLICT');
  });

  it('serializes concurrent registration so only one device becomes enabled', async () => {
    const point = await directPoint();
    const responses = await Promise.all([
      register(ownerToken, {
        hardwareId: hardwareId('RACEA'),
        displayName: 'Race A',
        monitoringPointId: point.id,
      }),
      register(ownerToken, {
        hardwareId: hardwareId('RACEB'),
        displayName: 'Race B',
        monitoringPointId: point.id,
      }),
    ]);

    expect(responses.map((item) => item.status).sort()).toEqual([201, 409]);
    expect(responses.find((item) => item.status === 409)?.body.error.code).toBe(
      'MONITORING_POINT_ACTIVE_DEVICE_CONFLICT',
    );
    expect(
      await prisma.device.count({
        where: { monitoringPointId: point.id, lifecycleStatus: DeviceLifecycleStatus.ENABLED },
      }),
    ).toBe(1);
  });

  it('validates registration input and rejects unknown properties', async () => {
    const response = await register(ownerToken, {
      hardwareId: 'lowercase',
      displayName: ' ',
      monitoringPointId: '',
      credential: 'must-not-be-accepted',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('updates display name and monitoring point with a safe audit trail', async () => {
    const source = await directPoint();
    const target = await directPoint();
    const device = await directDevice(source.id, DeviceLifecycleStatus.ENABLED);
    const response = await update(ownerToken, device.id, {
      displayName: '  Updated Device  ',
      monitoringPointId: target.id,
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      displayName: 'Updated Device',
      monitoringPointId: target.id,
      siteId: siteAId,
      hardwareId: device.hardwareId,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        requestId: response.headers['x-request-id'] as string,
        eventType: 'DEVICE_UPDATED',
      },
    });
    expect(audit.metadata).toMatchObject({
      before: { monitoringPointId: source.id },
      after: { monitoringPointId: target.id },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain('credentialHash');
  });

  it('does not create audit noise for an unchanged update', async () => {
    const device = await directDevice((await directPoint()).id, DeviceLifecycleStatus.ENABLED);
    const response = await update(ownerToken, device.id, { displayName: device.displayName });

    expect(response.status).toBe(200);
    expect(
      await prisma.auditLog.count({
        where: { requestId: response.headers['x-request-id'] as string },
      }),
    ).toBe(0);
  });

  it('rejects reassignment to an occupied or inactive monitoring point', async () => {
    const source = await directPoint();
    const occupied = await directPoint();
    const inactive = await directPoint(organizationAId, siteAId, false);
    const device = await directDevice(source.id, DeviceLifecycleStatus.ENABLED);
    await directDevice(occupied.id, DeviceLifecycleStatus.ENABLED);
    const [occupiedResponse, inactiveResponse] = await Promise.all([
      update(ownerToken, device.id, { monitoringPointId: occupied.id }),
      update(ownerToken, device.id, { monitoringPointId: inactive.id }),
    ]);

    expect(occupiedResponse.status).toBe(409);
    expect(occupiedResponse.body.error.code).toBe('MONITORING_POINT_ACTIVE_DEVICE_CONFLICT');
    expect(inactiveResponse.status).toBe(404);
    expect(inactiveResponse.body.error.code).toBe('MONITORING_POINT_NOT_FOUND');
  });

  it('rejects empty, immutable, lifecycle, telemetry, and unknown PATCH fields', async () => {
    const device = await directDevice((await directPoint()).id, DeviceLifecycleStatus.ENABLED);
    const responses = await Promise.all([
      update(ownerToken, device.id, {}),
      update(ownerToken, device.id, { hardwareId: hardwareId('MUTATE') }),
      update(ownerToken, device.id, { lifecycleStatus: DeviceLifecycleStatus.DISABLED }),
      update(ownerToken, device.id, { firmwareVersion: 'changed-by-admin' }),
      update(ownerToken, device.id, { lastSeenAt: new Date().toISOString() }),
      update(ownerToken, device.id, { unknown: true }),
    ]);

    expect(responses.map((item) => item.status)).toEqual([400, 400, 400, 400, 400, 400]);
    expect(responses.every((item) => item.body.error.code === 'VALIDATION_ERROR')).toBe(true);
  });

  it('rotates a credential, invalidates the old one, and audits safely', async () => {
    const registered = await register(ownerToken, {
      hardwareId: hardwareId('ROTATE'),
      displayName: 'Rotate Device',
      monitoringPointId: (await directPoint()).id,
    });
    const deviceId = registered.body.data.device.id as string;
    const oldSecret = registered.body.data.credential.secret as string;
    const before = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });
    const response = await rotate(ownerToken, deviceId);
    const stored = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });

    expect(response.status).toBe(200);
    expect(response.body.data.credential.secret).not.toBe(oldSecret);
    expect(JSON.stringify(response.body)).not.toContain('credentialHash');
    expect(stored.credentialHash).not.toBe(before.credentialHash);
    expect(await credentialService.verify(oldSecret, stored.credentialHash)).toBe(false);
    expect(
      await credentialService.verify(response.body.data.credential.secret, stored.credentialHash),
    ).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        requestId: response.headers['x-request-id'] as string,
        eventType: 'DEVICE_CREDENTIAL_ROTATED',
      },
    });
    const serialized = JSON.stringify(audit.metadata);
    expect(serialized).not.toContain(oldSecret);
    expect(serialized).not.toContain(response.body.data.credential.secret);
    expect(serialized).not.toContain('credentialHash');
    expect(serialized).not.toContain(ownerToken);
    expect(serialized).not.toContain('Authorization');
  });

  it('rejects credential rotation for a disabled device', async () => {
    const device = await directDevice((await directPoint()).id, DeviceLifecycleStatus.DISABLED);
    const response = await rotate(ownerToken, device.id);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('DEVICE_DISABLED');
  });

  it('disables a device idempotently with exactly one audit event', async () => {
    const device = await directDevice((await directPoint()).id, DeviceLifecycleStatus.ENABLED);
    await prisma.currentMonitoringPointState.create({
      data: {
        monitoringPointId: device.monitoringPointId,
        organizationId: device.organizationId,
        siteId: device.siteId,
        deviceId: device.id,
        serverRisk: 'DANGER',
        connectivityStatus: 'ONLINE',
        reasons: ['DANGER_TILT'],
        evaluatedAt: new Date(),
      },
    });
    const first = await disable(ownerToken, device.id);
    const second = await disable(ownerToken, device.id);

    expect(first.status).toBe(200);
    expect(first.body.data.lifecycleStatus).toBe(DeviceLifecycleStatus.DISABLED);
    expect(first.body.data.disabledAt).toEqual(expect.any(String));
    expect(second.status).toBe(200);
    expect(second.body.data.disabledAt).toBe(first.body.data.disabledAt);
    expect(
      await prisma.currentMonitoringPointState.findUniqueOrThrow({
        where: { monitoringPointId: device.monitoringPointId },
      }),
    ).toMatchObject({
      serverRisk: 'UNKNOWN',
      connectivityStatus: 'UNKNOWN',
      reasons: ['DEVICE_DISABLED'],
    });
    expect(
      await prisma.auditLog.count({
        where: { entityId: device.id, eventType: 'DEVICE_DISABLED' },
      }),
    ).toBe(1);
  });

  it('allows a replacement after the previous device is disabled', async () => {
    const point = await directPoint();
    const original = await directDevice(point.id, DeviceLifecycleStatus.ENABLED);
    expect((await disable(ownerToken, original.id)).status).toBe(200);

    const replacement = await register(ownerToken, {
      hardwareId: hardwareId('REPLACE'),
      displayName: 'Replacement Device',
      monitoringPointId: point.id,
    });
    expect(replacement.status).toBe(201);
    expect(
      await prisma.device.count({
        where: { monitoringPointId: point.id, lifecycleStatus: DeviceLifecycleStatus.ENABLED },
      }),
    ).toBe(1);
  });

  it('supports filters, search, network projection, and stable sorting', async () => {
    const point = await directPoint();
    const marker = entityLabel('FILTER');
    await directDevice(point.id, DeviceLifecycleStatus.DISABLED, undefined, undefined, {
      displayName: `Zulu ${marker}`,
      lastSeenAt: new Date('2026-01-02T00:00:00.000Z'),
      lastNetworkType: NetworkType.WIFI,
      lastSignalRssi: -71,
    });
    await directDevice(point.id, DeviceLifecycleStatus.DISABLED, undefined, undefined, {
      displayName: `Alpha ${marker}`,
      lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await directDevice(point.id, DeviceLifecycleStatus.DISABLED, undefined, undefined, {
      displayName: 'Unrelated Device',
    });
    const query =
      `siteId=${encodeURIComponent(siteAId)}` +
      `&monitoringPointId=${encodeURIComponent(point.id)}` +
      `&lifecycleStatus=DISABLED&search=${encodeURIComponent(marker)}&sort=displayName:asc`;
    const response = await list(ownerToken, organizationAId, query);

    expect(response.status).toBe(200);
    expect(response.body.data.map((item: { displayName: string }) => item.displayName)).toEqual([
      `Alpha ${marker}`,
      `Zulu ${marker}`,
    ]);
    expect(response.body.data[1].lastNetwork).toEqual({ type: NetworkType.WIFI, signalRssi: -71 });
  });

  it('uses default/maximum limits and an opaque cursor without duplicates', async () => {
    const point = await directPoint();
    const marker = entityLabel('PAGE');
    await prisma.device.createMany({
      data: Array.from({ length: 26 }, (_value, index) => ({
        organizationId: organizationAId,
        siteId: siteAId,
        monitoringPointId: point.id,
        hardwareId: hardwareId(`P${String(index).padStart(2, '0')}`),
        displayName: `${marker} ${String(index).padStart(2, '0')}`,
        lifecycleStatus: DeviceLifecycleStatus.DISABLED,
        disabledAt: new Date(),
        credentialHash: '$argon2id$integration-hash-only',
      })),
    });
    const base = `search=${encodeURIComponent(marker)}&sort=displayName:asc`;
    const first = await list(ownerToken, organizationAId, base);
    const second = await list(
      ownerToken,
      organizationAId,
      `${base}&cursor=${encodeURIComponent(first.body.page.nextCursor as string)}`,
    );
    const maximum = await list(ownerToken, organizationAId, `${base}&limit=100`);
    const tooLarge = await list(ownerToken, organizationAId, 'limit=101');
    const ids = [...first.body.data, ...second.body.data].map((item: { id: string }) => item.id);

    expect(first.body.data).toHaveLength(25);
    expect(first.body.page.hasMore).toBe(true);
    expect(second.body.data).toHaveLength(1);
    expect(new Set(ids).size).toBe(26);
    expect(maximum.body.data).toHaveLength(26);
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects malformed, tampered, or differently bound cursors', async () => {
    const point = await directPoint();
    const marker = entityLabel('CURSOR');
    await Promise.all([
      directDevice(point.id, DeviceLifecycleStatus.DISABLED, undefined, undefined, {
        displayName: `${marker} A`,
      }),
      directDevice(point.id, DeviceLifecycleStatus.DISABLED, undefined, undefined, {
        displayName: `${marker} B`,
      }),
    ]);
    const first = await list(
      ownerToken,
      organizationAId,
      `search=${encodeURIComponent(marker)}&sort=displayName:asc&limit=1`,
    );
    const cursor = encodeURIComponent(first.body.page.nextCursor as string);
    const responses = await Promise.all([
      list(ownerToken, organizationAId, 'cursor=invalid'),
      list(
        ownerToken,
        organizationAId,
        `search=${encodeURIComponent(marker)}&sort=displayName:desc&limit=1&cursor=${cursor}`,
      ),
      list(
        ownerToken,
        organizationAId,
        `search=${encodeURIComponent(`${marker} A`)}&sort=displayName:asc&limit=1&cursor=${cursor}`,
      ),
    ]);

    expect(responses.map((item) => item.status)).toEqual([400, 400, 400]);
    expect(responses.every((item) => item.body.error.code === 'INVALID_CURSOR')).toBe(true);
  });

  async function login(email: string): Promise<string> {
    const response = await send(http.post('/api/v1/auth/login').send({ email, password }));
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  function list(token: string, organizationId: string, query = '') {
    return authorized(
      http.get(`/api/v1/devices${query.length === 0 ? '' : `?${query}`}`),
      token,
      organizationId,
    );
  }

  function get(token: string, organizationId: string, deviceId: string) {
    return authorized(http.get(`/api/v1/devices/${deviceId}`), token, organizationId);
  }

  function register(token: string, body: Record<string, unknown>) {
    return authorized(http.post('/api/v1/devices').send(body), token, organizationAId);
  }

  function update(token: string, deviceId: string, body: Record<string, unknown>) {
    return authorized(http.patch(`/api/v1/devices/${deviceId}`).send(body), token, organizationAId);
  }

  function rotate(token: string, deviceId: string) {
    return authorized(
      http.post(`/api/v1/devices/${deviceId}/rotate-credential`),
      token,
      organizationAId,
    );
  }

  function disable(token: string, deviceId: string) {
    return authorized(http.post(`/api/v1/devices/${deviceId}/disable`), token, organizationAId);
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

  function directPoint(organizationId = organizationAId, siteId = siteAId, isActive = true) {
    entitySequence += 1;
    return prisma.monitoringPoint.create({
      data: {
        organizationId,
        siteId,
        name: `Device Point ${entitySequence} ${testRunId}`,
        isActive,
      },
    });
  }

  function directDevice(
    monitoringPointId: string,
    lifecycleStatus: DeviceLifecycleStatus,
    organizationId = organizationAId,
    siteId = siteAId,
    overrides: {
      hardwareId?: string;
      displayName?: string;
      lastSeenAt?: Date;
      lastNetworkType?: NetworkType;
      lastSignalRssi?: number;
    } = {},
  ) {
    entitySequence += 1;
    return prisma.device.create({
      data: {
        organizationId,
        siteId,
        monitoringPointId,
        hardwareId: overrides.hardwareId ?? hardwareId(`DIRECT${entitySequence}`),
        displayName: overrides.displayName ?? `Direct Device ${entitySequence}`,
        lifecycleStatus,
        disabledAt: lifecycleStatus === DeviceLifecycleStatus.DISABLED ? new Date() : null,
        credentialHash: '$argon2id$integration-hash-only',
        ...(overrides.lastSeenAt === undefined ? {} : { lastSeenAt: overrides.lastSeenAt }),
        ...(overrides.lastNetworkType === undefined
          ? {}
          : { lastNetworkType: overrides.lastNetworkType }),
        ...(overrides.lastSignalRssi === undefined
          ? {}
          : { lastSignalRssi: overrides.lastSignalRssi }),
      },
    });
  }

  function hardwareId(prefix: string): string {
    entitySequence += 1;
    return `${prefix}_${entitySequence}_${testRunId}`.toUpperCase();
  }

  function entityLabel(prefix: string): string {
    entitySequence += 1;
    return `${prefix}-${entitySequence}-${testRunId}`;
  }
});

function setTestEnvironment(): void {
  process.env.NODE_ENV = 'test';
  process.env.WEB_URL = 'http://localhost:3000';
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
