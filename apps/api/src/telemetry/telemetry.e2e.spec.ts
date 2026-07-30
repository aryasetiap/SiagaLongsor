import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, {
  type Response as SuperTestResponse,
  type Test as SuperTestRequest,
} from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { configureApp } from '../bootstrap/configure-app.js';
import { PrismaService } from '../database/prisma.service.js';
import { DeviceCredentialService } from '../devices/device-credential.service.js';
import {
  DeviceLifecycleStatus,
  FirmwareRiskLevel,
  NetworkType,
} from '../generated/prisma/enums.js';

describe('Telemetry ingestion API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let credentials: DeviceCredentialService;
  let http: ReturnType<typeof request>;
  let deviceId: string;
  let hardwareId: string;
  let secret: string;

  const testRunId = randomUUID();
  const organizationId = `telemetry-org-${testRunId}`;
  const siteId = `telemetry-site-${testRunId}`;
  const pointId = `telemetry-point-${testRunId}`;
  let requestSequence = 0;
  let payloadSequence = 0;

  beforeAll(async () => {
    setTestEnvironment();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaService);
    credentials = app.get(DeviceCredentialService);
    http = request(app.getHttpServer());

    await prisma.organization.create({
      data: { id: organizationId, name: 'Telemetry Organization', slug: `tel-${testRunId}` },
    });
    await prisma.site.create({
      data: {
        id: siteId,
        organizationId,
        name: 'Telemetry Site',
        slug: 'telemetry-site',
      },
    });
    await prisma.monitoringPoint.create({
      data: {
        id: pointId,
        organizationId,
        siteId,
        name: 'Telemetry Point',
      },
    });
    const issued = await credentials.issue();
    secret = issued.raw;
    hardwareId = `TEL_${testRunId}`.toUpperCase();
    const device = await prisma.device.create({
      data: {
        organizationId,
        siteId,
        monitoringPointId: pointId,
        hardwareId,
        displayName: 'Telemetry Device',
        credentialHash: issued.hash,
        credentialRotatedAt: issued.issuedAt,
      },
    });
    deviceId = device.id;
  }, 30_000);

  afterAll(async () => {
    if (prisma !== undefined) {
      await prisma.telemetry.deleteMany({ where: { deviceId } });
      await prisma.device.deleteMany({ where: { organizationId } });
      await prisma.monitoringPoint.deleteMany({ where: { organizationId } });
      await prisma.site.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await app?.close();
  });

  it('accepts valid telemetry and atomically updates current device state', async () => {
    const payload = validPayload();
    const before = new Date();
    const response = await ingest(payload);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      accepted: true,
      duplicate: false,
      telemetryId: expect.any(String),
      receivedAt: expect.any(String),
    });
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.body).not.toHaveProperty('serverRisk');

    const [stored, device] = await Promise.all([
      prisma.telemetry.findUniqueOrThrow({ where: { id: response.body.telemetryId as string } }),
      prisma.device.findUniqueOrThrow({ where: { id: deviceId } }),
    ]);
    expect(stored).toMatchObject({
      deviceId,
      monitoringPointId: pointId,
      messageId: payload.messageId,
      bootId: payload.bootId,
      sequence: BigInt(payload.sequence),
      firmwareVersion: payload.firmwareVersion,
      networkType: NetworkType.WIFI,
      firmwareRiskLevel: FirmwareRiskLevel.SAFE,
      firmwareSirenActive: false,
    });
    expect(device.lastSeenAt?.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(device.lastTelemetryAt?.toISOString()).toBe(new Date(payload.timestamp).toISOString());
    expect(device.firmwareVersion).toBe(payload.firmwareVersion);
    expect(device.lastNetworkType).toBe(NetworkType.WIFI);
    expect(device.lastSignalRssi?.toNumber()).toBe(-67);
  });

  it('stores only the canonical body as raw payload without credentials or headers', async () => {
    const payload = validPayload();
    const response = await ingest(payload);
    const stored = await prisma.telemetry.findUniqueOrThrow({
      where: { id: response.body.telemetryId as string },
    });
    const serialized = JSON.stringify(stored.rawPayload);

    expect(stored.rawPayload).toEqual(payload);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(hardwareId);
    expect(serialized).not.toContain('Authorization');
    expect(serialized).not.toContain('credentialHash');
  });

  it('supports an omitted network object and persists nullable network state', async () => {
    const payload = validPayload();
    const withoutNetwork: Record<string, unknown> = { ...payload };
    delete withoutNetwork.network;
    const response = await ingest(withoutNetwork);
    const stored = await prisma.telemetry.findUniqueOrThrow({
      where: { id: response.body.telemetryId as string },
    });

    expect(response.status).toBe(201);
    expect(stored.networkType).toBeNull();
    expect(stored.signalRssi).toBeNull();
  });

  it('returns the same acknowledgement for an exact duplicate without another row', async () => {
    const payload = validPayload();
    const first = await ingest(payload);
    const second = await ingest(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({
      ...first.body,
      duplicate: true,
    });
    expect(
      await prisma.telemetry.count({ where: { deviceId, messageId: payload.messageId } }),
    ).toBe(1);
  });

  it('canonicalizes object key order for exact duplicate detection', async () => {
    const payload = validPayload();
    const first = await ingest(payload);
    const reordered = {
      deviceAssessment: payload.deviceAssessment,
      readings: payload.readings,
      network: payload.network,
      firmwareVersion: payload.firmwareVersion,
      timestamp: payload.timestamp,
      sequence: payload.sequence,
      bootId: payload.bootId,
      messageId: payload.messageId,
    };
    const second = await ingest(reordered);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.telemetryId).toBe(first.body.telemetryId);
  });

  it('rejects reuse of messageId with a different canonical payload', async () => {
    const payload = validPayload();
    expect((await ingest(payload)).status).toBe(201);
    const response = await ingest({
      ...payload,
      readings: { ...payload.readings, soilMoisturePct: 71.25 },
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(
      await prisma.telemetry.count({ where: { deviceId, messageId: payload.messageId } }),
    ).toBe(1);
  });

  it('rejects a duplicate bootId and sequence with a different messageId', async () => {
    const payload = validPayload();
    expect((await ingest(payload)).status).toBe(201);
    const response = await ingest({
      ...payload,
      messageId: messageId(),
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SEQUENCE_CONFLICT');
  });

  it('allows the same sequence after bootId changes', async () => {
    const payload = validPayload();
    expect((await ingest(payload)).status).toBe(201);
    const response = await ingest({
      ...payload,
      messageId: messageId(),
      bootId: `next-${payload.bootId}`,
    });

    expect(response.status).toBe(201);
  });

  it('serializes concurrent exact retries into one new and one duplicate response', async () => {
    const payload = validPayload();
    const responses = await Promise.all([ingest(payload), ingest(payload)]);

    expect(responses.map((item) => item.status).sort()).toEqual([200, 201]);
    expect(responses.map((item) => item.body.duplicate).sort()).toEqual([false, true]);
    expect(responses[0].body.telemetryId).toBe(responses[1].body.telemetryId);
    expect(
      await prisma.telemetry.count({ where: { deviceId, messageId: payload.messageId } }),
    ).toBe(1);
  });

  it('serializes concurrent conflicting payloads without a database error', async () => {
    const payload = validPayload();
    const responses = await Promise.all([
      ingest(payload),
      ingest({
        ...payload,
        readings: { ...payload.readings, rainfallMmHour: 99.5 },
      }),
    ]);

    expect(responses.map((item) => item.status).sort()).toEqual([201, 409]);
    expect(responses.find((item) => item.status === 409)?.body.error.code).toBe(
      'IDEMPOTENCY_CONFLICT',
    );
    expect(responses.every((item) => item.status < 500)).toBe(true);
  });

  it('requires Idempotency-Key to exactly equal messageId', async () => {
    const payload = validPayload();
    const [missing, mismatched] = await Promise.all([
      ingest(payload, { idempotencyKey: null }),
      ingest(payload, { idempotencyKey: messageId() }),
    ]);

    expect([missing.status, mismatched.status]).toEqual([400, 400]);
    expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
    expect(mismatched.body.error.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
  });

  it('rejects missing, malformed, unknown, and incorrect device credentials uniformly', async () => {
    const payload = validPayload();
    const unknownHardware = `UNKNOWN_${testRunId}`.toUpperCase();
    const responses = await Promise.all([
      ingest(payload, { authorization: null }),
      ingest(payload, { authorization: 'Bearer invalid' }),
      ingest(payload, { authorization: `Device ${unknownHardware}.${secret}` }),
      ingest(payload, { authorization: `Device ${hardwareId}.${'x'.repeat(43)}` }),
    ]);

    expect(responses.map((item) => item.status)).toEqual([401, 401, 401, 401]);
    expect(responses.every((item) => item.body.error.code === 'DEVICE_CREDENTIAL_INVALID')).toBe(
      true,
    );
  });

  it('invalidates the old credential immediately after rotation', async () => {
    const oldSecret = secret;
    const issued = await credentials.issue();
    await prisma.device.update({
      where: { id: deviceId },
      data: { credentialHash: issued.hash, credentialRotatedAt: issued.issuedAt },
    });
    secret = issued.raw;

    const oldResponse = await ingest(validPayload(), {
      authorization: `Device ${hardwareId}.${oldSecret}`,
    });
    const currentResponse = await ingest(validPayload());

    expect(oldResponse.status).toBe(401);
    expect(oldResponse.body.error.code).toBe('DEVICE_CREDENTIAL_INVALID');
    expect(currentResponse.status).toBe(201);
  });

  it('rejects a disabled device before telemetry storage', async () => {
    await prisma.device.update({
      where: { id: deviceId },
      data: { lifecycleStatus: DeviceLifecycleStatus.DISABLED, disabledAt: new Date() },
    });
    try {
      const payload = validPayload();
      const response = await ingest(payload);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('DEVICE_DISABLED');
      expect(
        await prisma.telemetry.count({ where: { deviceId, messageId: payload.messageId } }),
      ).toBe(0);
    } finally {
      await prisma.device.update({
        where: { id: deviceId },
        data: { lifecycleStatus: DeviceLifecycleStatus.ENABLED, disabledAt: null },
      });
    }
  });

  it('validates the canonical schema and rejects unknown nested or identity fields', async () => {
    const payload = validPayload();
    const responses = await Promise.all([
      ingest({ ...payload, deviceId }),
      ingest({ ...validPayload(), hardwareId }),
      ingest({ ...validPayload(), bootId: '' }),
      ingest({ ...validPayload(), readings: { ...payload.readings, soilMoisturePct: 101 } }),
      ingest({
        ...validPayload(),
        network: { ...payload.network, unknown: true },
      }),
      ingest({
        ...validPayload(),
        deviceAssessment: { ...payload.deviceAssessment, serverRisk: 'SAFE' },
      }),
    ]);

    expect(responses.map((item) => item.status)).toEqual([400, 400, 400, 400, 400, 400]);
    expect(responses.every((item) => item.body.error.code === 'VALIDATION_ERROR')).toBe(true);
  });

  it('rejects non-finite, negative rainfall, unsafe sequence, and excessive future timestamp', async () => {
    const responses = await Promise.all([
      ingest({ ...validPayload(), readings: { ...validPayload().readings, rainfallMmHour: -1 } }),
      ingest({
        ...validPayload(),
        readings: { ...validPayload().readings, rainfallMmHour: Number.POSITIVE_INFINITY },
      }),
      ingest({ ...validPayload(), sequence: Number.MAX_SAFE_INTEGER + 1 }),
      ingest({
        ...validPayload(),
        timestamp: new Date(Date.now() + 301_000).toISOString(),
      }),
    ]);

    expect(responses.map((item) => item.status)).toEqual([400, 400, 400, 400]);
    expect(responses.every((item) => item.body.error.code === 'VALIDATION_ERROR')).toBe(true);
  });

  it('stores late telemetry without moving latest telemetry-derived state backward', async () => {
    const recentTimestamp = new Date().toISOString();
    const recent = validPayload({
      timestamp: recentTimestamp,
      firmwareVersion: '2.0.0',
      network: { type: NetworkType.WIFI, signalRssi: -55 },
    });
    expect((await ingest(recent)).status).toBe(201);
    const afterRecent = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });

    const late = validPayload({
      timestamp: new Date(Date.now() - 86_400_000).toISOString(),
      firmwareVersion: '1.0.0',
      network: { type: NetworkType.CELLULAR, signalRssi: -92 },
    });
    expect((await ingest(late)).status).toBe(201);
    const afterLate = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });

    expect(afterLate.lastTelemetryAt?.toISOString()).toBe(recentTimestamp);
    expect(afterLate.firmwareVersion).toBe('2.0.0');
    expect(afterLate.lastNetworkType).toBe(NetworkType.WIFI);
    expect(afterLate.lastSignalRssi?.toNumber()).toBe(-55);
    expect(afterLate.lastSeenAt?.getTime()).toBeGreaterThanOrEqual(
      afterRecent.lastSeenAt?.getTime() ?? 0,
    );
    expect(
      await prisma.telemetry.count({
        where: { deviceId, messageId: { in: [recent.messageId, late.messageId] } },
      }),
    ).toBe(2);
  });

  it('requires JSON content type after authenticating the device', async () => {
    const payload = validPayload();
    const response = await send(
      http
        .post('/api/v1/iot/telemetry')
        .set('Authorization', `Device ${hardwareId}.${secret}`)
        .set('Idempotency-Key', payload.messageId)
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify(payload)),
    );

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rate limits an authenticated device with a stable 429 error', async () => {
    const previousMaximum = process.env.TELEMETRY_RATE_LIMIT_MAX;
    process.env.TELEMETRY_RATE_LIMIT_MAX = '2';
    const issued = await credentials.issue();
    const ratePoint = await prisma.monitoringPoint.create({
      data: {
        organizationId,
        siteId,
        name: `Rate Point ${testRunId}`,
      },
    });
    const rateHardwareId = `RATE_${testRunId}`.toUpperCase();
    const rateDevice = await prisma.device.create({
      data: {
        organizationId,
        siteId,
        monitoringPointId: ratePoint.id,
        hardwareId: rateHardwareId,
        displayName: 'Rate Device',
        credentialHash: issued.hash,
      },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const rateApp = module.createNestApplication<NestExpressApplication>();
    configureApp(rateApp);
    await rateApp.init();
    const rateHttp = request(rateApp.getHttpServer());

    try {
      const makeRequest = (payload: ReturnType<typeof validPayload>) =>
        rateHttp
          .post('/api/v1/iot/telemetry')
          .set('Authorization', `Device ${rateHardwareId}.${issued.raw}`)
          .set('Idempotency-Key', payload.messageId)
          .send(payload);
      const first = await makeRequest(validPayload());
      const second = await makeRequest(validPayload());
      const third = await makeRequest(validPayload());

      expect([first.status, second.status, third.status]).toEqual([201, 201, 429]);
      expect(third.body.error.code).toBe('RATE_LIMITED');
    } finally {
      await rateApp.close();
      await prisma.telemetry.deleteMany({ where: { deviceId: rateDevice.id } });
      await prisma.device.delete({ where: { id: rateDevice.id } });
      await prisma.monitoringPoint.delete({ where: { id: ratePoint.id } });
      if (previousMaximum === undefined) {
        delete process.env.TELEMETRY_RATE_LIMIT_MAX;
      } else {
        process.env.TELEMETRY_RATE_LIMIT_MAX = previousMaximum;
      }
    }
  }, 30_000);

  function ingest(
    payload: Record<string, unknown>,
    options: {
      authorization?: string | null;
      idempotencyKey?: string | null;
    } = {},
  ): Promise<SuperTestResponse> {
    let agent = http.post('/api/v1/iot/telemetry');
    const authorization =
      options.authorization === undefined
        ? `Device ${hardwareId}.${secret}`
        : options.authorization;
    const idempotencyKey =
      options.idempotencyKey === undefined
        ? typeof payload.messageId === 'string'
          ? payload.messageId
          : ''
        : options.idempotencyKey;
    if (authorization !== null) agent = agent.set('Authorization', authorization);
    if (idempotencyKey !== null) agent = agent.set('Idempotency-Key', idempotencyKey);
    return send(agent.send(payload));
  }

  function send(agent: SuperTestRequest): Promise<SuperTestResponse> {
    requestSequence += 1;
    return agent.set('x-request-id', `telemetry-e2e-${testRunId}-${requestSequence}`);
  }

  function validPayload(
    overrides: Partial<{
      timestamp: string;
      firmwareVersion: string;
      network: { type: NetworkType; signalRssi: number };
    }> = {},
  ) {
    payloadSequence += 1;
    return {
      messageId: messageId(),
      bootId: `boot-${testRunId}-${payloadSequence}`,
      sequence: payloadSequence,
      timestamp: overrides.timestamp ?? new Date(Date.now() - 1_000).toISOString(),
      firmwareVersion: overrides.firmwareVersion ?? '1.0.0',
      network: overrides.network ?? { type: NetworkType.WIFI, signalRssi: -67 },
      readings: {
        tiltXDeg: 0.8,
        tiltYDeg: -0.4,
        tiltMagnitudeDeg: 0.9,
        soilMoisturePct: 62.5,
        rainfallMmHour: 12.4,
        batteryVoltage: 12.7,
      },
      deviceAssessment: {
        riskLevel: FirmwareRiskLevel.SAFE,
        sirenActive: false,
      },
    };
  }

  function messageId(): string {
    return `msg_${randomUUID()}`;
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
  process.env.TELEMETRY_MAX_FUTURE_SKEW_SECONDS = '300';
  process.env.TELEMETRY_RATE_LIMIT_MAX = '120';
  process.env.TELEMETRY_RATE_LIMIT_TTL_MS = '60000';
}
