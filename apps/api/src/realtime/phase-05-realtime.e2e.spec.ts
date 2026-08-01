import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../app.module.js';
import { AlertObservationService } from '../alerts/alert-observation.service.js';
import { configureApp } from '../bootstrap/configure-app.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { PrismaService } from '../database/prisma.service.js';
import { DeviceCredentialService } from '../devices/device-credential.service.js';
import {
  AlertStatus,
  AlertType,
  DeviceLifecycleStatus,
  FirmwareRiskLevel,
  NetworkType,
  Role,
} from '../generated/prisma/enums.js';
import { RedisService } from '../redis/redis.service.js';
import type { TelemetryDto } from '../telemetry/dto/telemetry.dto.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { RealtimeConnectionRegistry } from './realtime-connection.registry.js';
import { RealtimePostCommitService } from './realtime-post-commit.service.js';
import { REALTIME_REDIS_CHANNEL, RealtimeRedisService } from './realtime-redis.service.js';
import type { PublicRealtimeEvent } from './realtime.types.js';

describe.sequential('Phase 05 realtime SSE across API instances', () => {
  const runId = randomUUID();
  const organizationAId = `realtime-org-a-${runId}`;
  const organizationBId = `realtime-org-b-${runId}`;
  const siteAId = `realtime-site-a-${runId}`;
  const siteBId = `realtime-site-b-${runId}`;
  const pointAId = `realtime-point-a-${runId}`;
  const pointBId = `realtime-point-b-${runId}`;
  const ownerAId = `realtime-owner-a-${runId}`;
  const adminAId = `realtime-admin-a-${runId}`;
  const ownerBId = `realtime-owner-b-${runId}`;
  const ownerAEmail = `realtime-owner-a-${runId}@example.invalid`;
  const adminAEmail = `realtime-admin-a-${runId}@example.invalid`;
  const ownerBEmail = `realtime-owner-b-${runId}@example.invalid`;
  const password = `Realtime-${randomUUID()}`;

  let instanceA: INestApplication;
  let instanceB: INestApplication;
  let prisma: PrismaService;
  let baseA: string;
  let baseB: string;
  let ownerAToken: string;
  let adminAToken: string;
  let ownerBToken: string;
  let deviceId: string;
  let deviceCredentialHash: string;
  const hardwareId = `RT_${runId}`.toUpperCase();
  let telemetrySequence = 0;

  beforeAll(async () => {
    instanceA = await createApplication();
    instanceB = await createApplication();
    prisma = instanceA.get(PrismaService);
    baseA = await instanceA.getUrl();
    baseB = await instanceB.getUrl();

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'Realtime Organization A', slug: `rt-a-${runId}` },
        { id: organizationBId, name: 'Realtime Organization B', slug: `rt-b-${runId}` },
      ],
    });
    await prisma.site.createMany({
      data: [
        {
          id: siteAId,
          organizationId: organizationAId,
          name: 'Realtime Site A',
          slug: `rt-a-${runId}`,
        },
        {
          id: siteBId,
          organizationId: organizationBId,
          name: 'Realtime Site B',
          slug: `rt-b-${runId}`,
        },
      ],
    });
    await prisma.monitoringPoint.createMany({
      data: [
        {
          id: pointAId,
          organizationId: organizationAId,
          siteId: siteAId,
          name: 'Realtime Point A',
        },
        {
          id: pointBId,
          organizationId: organizationBId,
          siteId: siteBId,
          name: 'Realtime Point B',
        },
      ],
    });
    await prisma.riskProfile.create({
      data: { ...provisionalProfileData(), organizationId: organizationAId, siteId: siteAId },
    });
    const credential = await instanceA.get(DeviceCredentialService).issue();
    const device = await prisma.device.create({
      data: {
        organizationId: organizationAId,
        siteId: siteAId,
        monitoringPointId: pointAId,
        hardwareId,
        displayName: 'Realtime Device',
        credentialHash: credential.hash,
        credentialRotatedAt: credential.issuedAt,
      },
    });
    deviceId = device.id;
    deviceCredentialHash = device.credentialHash;
    await prisma.user.createMany({
      data: [
        {
          id: ownerAId,
          email: ownerAEmail,
          normalizedEmail: ownerAEmail,
          name: 'Realtime Owner A',
          passwordHash,
        },
        {
          id: adminAId,
          email: adminAEmail,
          normalizedEmail: adminAEmail,
          name: 'Realtime Admin A',
          passwordHash,
        },
        {
          id: ownerBId,
          email: ownerBEmail,
          normalizedEmail: ownerBEmail,
          name: 'Realtime Owner B',
          passwordHash,
        },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { organizationId: organizationAId, userId: ownerAId, role: Role.PROJECT_OWNER },
        { organizationId: organizationAId, userId: adminAId, role: Role.SCHOOL_ADMIN },
        { organizationId: organizationBId, userId: ownerBId, role: Role.PROJECT_OWNER },
      ],
    });
    ownerAToken = await login(baseA, ownerAEmail);
    adminAToken = await login(baseA, adminAEmail);
    ownerBToken = await login(baseA, ownerBEmail);
  }, 40_000);

  afterAll(async () => {
    if (prisma !== undefined) {
      await prisma.alertLifecycleAction.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.alertEvent.deleteMany({
        where: { alert: { organizationId: { in: [organizationAId, organizationBId] } } },
      });
      await prisma.auditLog.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.alert.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.currentMonitoringPointState.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.riskAssessment.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.telemetry.deleteMany({
        where: { device: { organizationId: { in: [organizationAId, organizationBId] } } },
      });
      await prisma.device.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.riskProfile.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.refreshSession.deleteMany({
        where: { userId: { in: [ownerAId, adminAId, ownerBId] } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: [ownerAId, adminAId, ownerBId] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [ownerAId, adminAId, ownerBId] } } });
      await prisma.monitoringPoint.deleteMany({ where: { id: { in: [pointAId, pointBId] } } });
      await prisma.site.deleteMany({ where: { id: { in: [siteAId, siteBId] } } });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationAId, organizationBId] } },
      });
    }
    await instanceB?.close();
    await instanceA?.close();
  }, 30_000);

  it('enforces bearer and organization authorization without accepting query credentials', async () => {
    const missingBearer = await fetch(`${baseB}/api/v1/realtime/stream`, {
      headers: { 'X-Organization-Id': organizationAId },
    });
    expect(missingBearer.status).toBe(401);

    const queryOnly = await fetch(`${baseB}/api/v1/realtime/stream?token=not-a-token`, {
      headers: { 'X-Organization-Id': organizationAId },
    });
    expect(queryOnly.status).toBe(401);

    const queryWithBearer = await fetch(`${baseB}/api/v1/realtime/stream?credential=forbidden`, {
      headers: authHeaders(ownerAToken, organizationAId),
    });
    expect(queryWithBearer.status).toBe(400);

    const missingOrganization = await fetch(`${baseB}/api/v1/realtime/stream`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    });
    expect(missingOrganization.status).toBe(400);

    const crossOrganization = await fetch(`${baseB}/api/v1/realtime/stream`, {
      headers: authHeaders(ownerAToken, organizationBId),
    });
    expect(crossOrganization.status).toBe(403);
  });

  it('opens owner and admin fetch streams with exact headers and a comment keepalive', async () => {
    for (const token of [ownerAToken, adminAToken]) {
      const stream = await openStream(baseB, token, organizationAId);
      expect(stream.response.status).toBe(200);
      expect(stream.response.headers.get('content-type')).toContain('text/event-stream');
      expect(stream.response.headers.get('cache-control')).toBe('no-cache');
      expect(await stream.reader.nextFrame()).toBe(': keepalive');
      stream.close();
    }
  });

  it('fans out a committed lifecycle event from instance A to instance B with organization isolation', async () => {
    const ownerStream = await openStream(baseB, ownerAToken, organizationAId);
    const adminStream = await openStream(baseB, adminAToken, organizationAId);
    const otherStream = await openStream(baseB, ownerBToken, organizationBId);
    await Promise.all([
      ownerStream.reader.nextFrame(),
      adminStream.reader.nextFrame(),
      otherStream.reader.nextFrame(),
    ]);
    const alert = await createAlert(organizationAId, siteAId, pointAId);
    const actionId = randomUUID();
    const mutation = await lifecycle(
      baseA,
      ownerAToken,
      organizationAId,
      alert.id,
      'acknowledge',
      actionId,
      {
        actionId,
        note: 'Diterima',
        fieldCondition: 'Diperiksa',
        sopExecuted: true,
      },
    );
    expect(mutation.status).toBe(200);

    const [ownerEvent, adminEvent] = await Promise.all([
      ownerStream.reader.nextEvent(),
      adminStream.reader.nextEvent(),
    ]);
    expect(ownerEvent).toMatchObject({ eventType: 'ALERT_ACKNOWLEDGED', alertId: alert.id });
    expect(adminEvent).toMatchObject({ eventType: 'ALERT_ACKNOWLEDGED', alertId: alert.id });
    expect(ownerEvent).not.toHaveProperty('organizationId');
    await expect(otherStream.reader.nextEvent(400)).rejects.toThrow('SSE timeout');

    ownerStream.close();
    adminStream.close();
    otherStream.close();
  });

  it('does not republish an exact lifecycle retry and accepts Last-Event-ID without replay', async () => {
    const stream = await openStream(baseB, ownerAToken, organizationAId, {
      'Last-Event-ID': 'past-event',
    });
    await stream.reader.nextFrame();
    await expect(stream.reader.nextEvent(300)).rejects.toThrow('SSE timeout');
    const alert = await createAlert(organizationAId, siteAId, pointAId);
    const actionId = randomUUID();
    const body = { actionId, note: 'Diterima', fieldCondition: 'Stabil', sopExecuted: true };
    expect(
      (
        await lifecycle(
          baseA,
          ownerAToken,
          organizationAId,
          alert.id,
          'acknowledge',
          actionId,
          body,
        )
      ).status,
    ).toBe(200);
    expect((await stream.reader.nextEvent()).eventType).toBe('ALERT_ACKNOWLEDGED');
    expect(
      (
        await lifecycle(
          baseA,
          ownerAToken,
          organizationAId,
          alert.id,
          'acknowledge',
          actionId,
          body,
        )
      ).status,
    ).toBe(200);
    await expect(stream.reader.nextEvent(400)).rejects.toThrow('SSE timeout');
    stream.close();
  });

  it('serializes concurrent lifecycle mutations with one committed event and no HTTP 500', async () => {
    const stream = await openStream(baseB, ownerAToken, organizationAId);
    await stream.reader.nextFrame();
    const alert = await createAlert(organizationAId, siteAId, pointAId);
    const actions = [randomUUID(), randomUUID()];
    const responses = await Promise.all(
      actions.map((actionId) =>
        lifecycle(baseA, ownerAToken, organizationAId, alert.id, 'acknowledge', actionId, {
          actionId,
          note: 'Concurrent',
          fieldCondition: 'Checked',
          sopExecuted: true,
        }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.every((response) => response.status !== 500)).toBe(true);
    expect((await stream.reader.nextEvent()).eventType).toBe('ALERT_ACKNOWLEDGED');
    await expect(stream.reader.nextEvent(350)).rejects.toThrow('SSE timeout');
    expect(await prisma.alertLifecycleAction.count({ where: { alertId: alert.id } })).toBe(1);
    stream.close();
  });

  it.each([
    ['resolve', 'ALERT_RESOLVED'],
    ['false-alarm', 'ALERT_FALSE_ALARM'],
  ] as const)('publishes %s lifecycle mapping after commit', async (endpoint, eventType) => {
    const stream = await openStream(baseB, ownerAToken, organizationAId);
    await stream.reader.nextFrame();
    const alert = await createAlert(organizationAId, siteAId, pointAId);
    if (endpoint === 'resolve') {
      await acknowledge(alert.id);
      expect((await stream.reader.nextEvent()).eventType).toBe('ALERT_ACKNOWLEDGED');
    }
    const actionId = randomUUID();
    const body =
      endpoint === 'resolve'
        ? { actionId, resolutionNote: 'Selesai' }
        : { actionId, reason: 'False alarm' };
    const result = await lifecycle(
      baseA,
      ownerAToken,
      organizationAId,
      alert.id,
      endpoint,
      actionId,
      body,
    );
    expect(result.status).toBe(200);
    expect(await stream.reader.nextEvent()).toMatchObject({ eventType, alertId: alert.id });
    stream.close();
  });

  it('keeps a committed lifecycle mutation successful when Redis publication fails', async () => {
    const alert = await createAlert(organizationAId, siteAId, pointAId);
    const publisher = instanceA.get(RealtimeRedisService);
    const failure = vi.spyOn(publisher, 'publish').mockRejectedValueOnce(new Error('unavailable'));
    const actionId = randomUUID();
    const response = await lifecycle(
      baseA,
      ownerAToken,
      organizationAId,
      alert.id,
      'acknowledge',
      actionId,
      {
        actionId,
        note: 'Committed',
        fieldCondition: 'Checked',
        sopExecuted: true,
      },
    );
    failure.mockRestore();

    expect(response.status).toBe(200);
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).status).toBe(
      AlertStatus.ACKNOWLEDGED,
    );
    expect(await prisma.alertLifecycleAction.count({ where: { actionId } })).toBe(1);
    expect(
      await prisma.alertEvent.count({
        where: { alertId: alert.id, eventType: 'ALERT_ACKNOWLEDGED' },
      }),
    ).toBe(1);
  });

  it('ignores malformed Redis input and continues delivering later valid events', async () => {
    const stream = await openStream(baseB, ownerAToken, organizationAId);
    await stream.reader.nextFrame();
    await instanceA.get(RedisService).client.publish(REALTIME_REDIS_CHANNEL, '{malformed');
    await expect(stream.reader.nextEvent(250)).rejects.toThrow('SSE timeout');

    const alert = await createAlert(organizationAId, siteAId, pointAId);
    const actionId = randomUUID();
    await lifecycle(baseA, ownerAToken, organizationAId, alert.id, 'acknowledge', actionId, {
      actionId,
      note: 'Valid after malformed',
      fieldCondition: 'Checked',
      sopExecuted: true,
    });
    expect((await stream.reader.nextEvent()).eventType).toBe('ALERT_ACKNOWLEDGED');
    stream.close();
  });

  it('publishes alert creation, observation, and state invalidation only from the outer post-commit boundary', async () => {
    const stream = await openStream(baseB, ownerAToken, organizationAId);
    await stream.reader.nextFrame();
    const observations = instanceA.get(AlertObservationService);
    const postCommit = instanceA.get(RealtimePostCommitService);
    const first = await prisma.$transaction((transaction) =>
      observations.observe(transaction, {
        organizationId: organizationAId,
        siteId: siteAId,
        monitoringPointId: pointAId,
        deviceId: null,
        type: AlertType.DEVICE_SERVER_MISMATCH,
        reasons: ['DEVICE_SERVER_MISMATCH'],
        observedAt: new Date(),
        observationKey: `realtime-create-${randomUUID()}`,
      }),
    );
    await expect(stream.reader.nextEvent(250)).rejects.toThrow('SSE timeout');
    expect(first.realtime?.eventType).toBe('ALERT_CREATED');
    await postCommit.dispatch(first.realtime === null ? [] : [first.realtime]);
    expect(await stream.reader.nextEvent()).toMatchObject({
      eventType: 'ALERT_CREATED',
      alertId: first.alert.id,
    });

    const second = await prisma.$transaction((transaction) =>
      observations.observe(transaction, {
        organizationId: organizationAId,
        siteId: siteAId,
        monitoringPointId: pointAId,
        deviceId: null,
        type: AlertType.DEVICE_SERVER_MISMATCH,
        reasons: ['DEVICE_SERVER_MISMATCH'],
        observedAt: new Date(),
        observationKey: `realtime-observe-${randomUUID()}`,
      }),
    );
    expect(second.realtime?.eventType).toBe('ALERT_OBSERVED');
    await postCommit.dispatch(second.realtime === null ? [] : [second.realtime]);
    expect(await stream.reader.nextEvent()).toMatchObject({
      eventType: 'ALERT_OBSERVED',
      alertId: first.alert.id,
    });

    await postCommit.dispatch([
      {
        eventType: 'MONITORING_POINT_STATE_CHANGED',
        occurredAt: new Date().toISOString(),
        organizationId: organizationAId,
        siteId: siteAId,
        monitoringPointId: pointAId,
        alertId: null,
      },
    ]);
    expect(await stream.reader.nextEvent()).toMatchObject({
      eventType: 'MONITORING_POINT_STATE_CHANGED',
      monitoringPointId: pointAId,
      alertId: null,
    });

    const rollbackKey = `realtime-rollback-${randomUUID()}`;
    await expect(
      prisma.$transaction(async (transaction) => {
        await observations.observe(transaction, {
          organizationId: organizationAId,
          siteId: siteAId,
          monitoringPointId: pointAId,
          deviceId: null,
          type: AlertType.RISK_WATCH,
          reasons: ['WATCH_THRESHOLDS_MET'],
          observedAt: new Date(),
          observationKey: rollbackKey,
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      await prisma.alertEvent.findUnique({ where: { observationKey: rollbackKey } }),
    ).toBeNull();
    await expect(stream.reader.nextEvent(250)).rejects.toThrow('SSE timeout');
    stream.close();
  });

  it('publishes telemetry risk transitions while suppressing duplicates and late data', async () => {
    const stream = await openStream(baseB, ownerAToken, organizationAId);
    await stream.reader.nextFrame();
    const danger = telemetryPayload({ risk: FirmwareRiskLevel.DANGER, tilt: 9 });
    expect((await ingestTelemetry(danger)).duplicate).toBe(false);
    const createdEvents = [await stream.reader.nextEvent(), await stream.reader.nextEvent()];
    expect(createdEvents.map((event) => event.eventType)).toEqual([
      'MONITORING_POINT_STATE_CHANGED',
      'ALERT_CREATED',
    ]);

    expect((await ingestTelemetry(danger)).duplicate).toBe(true);
    await expect(stream.reader.nextEvent(300)).rejects.toThrow('SSE timeout');

    const late = telemetryPayload({
      risk: FirmwareRiskLevel.SAFE,
      tilt: 1,
      timestamp: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect((await ingestTelemetry(late)).duplicate).toBe(false);
    await expect(stream.reader.nextEvent(300)).rejects.toThrow('SSE timeout');

    const repeated = telemetryPayload({ risk: FirmwareRiskLevel.DANGER, tilt: 9 });
    expect((await ingestTelemetry(repeated)).duplicate).toBe(false);
    const observedEvents = [await stream.reader.nextEvent(), await stream.reader.nextEvent()];
    expect(observedEvents.map((event) => event.eventType)).toEqual([
      'MONITORING_POINT_STATE_CHANGED',
      'ALERT_OBSERVED',
    ]);

    stream.close();
  });

  it('closes streams at token expiry and after membership deactivation, then cleans registry state', async () => {
    const session = await prisma.refreshSession.findFirstOrThrow({
      where: { userId: adminAId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const jwt = instanceB.get(JwtService);
    const config = instanceB.get<AppConfig>(APP_CONFIG);
    const shortToken = await jwt.signAsync(
      { sub: adminAId, sid: session.id, type: 'access', jti: randomUUID() },
      {
        secret: config.auth.accessTokenSecret,
        issuer: config.auth.issuer,
        audience: config.auth.audience,
        expiresIn: 1,
      },
    );
    const expiring = await openStream(baseB, shortToken, organizationAId);
    await expiring.reader.nextFrame();
    await expect(expiring.reader.waitForEnd(2_500)).resolves.toBeUndefined();
    expiring.close();

    const registry = instanceB.get(RealtimeConnectionRegistry);
    const baselineConnections = registry.diagnostics().activeConnections;
    const membershipStream = await openStream(baseB, adminAToken, organizationAId);
    await membershipStream.reader.nextFrame();
    await prisma.membership.update({
      where: { organizationId_userId: { organizationId: organizationAId, userId: adminAId } },
      data: { isActive: false },
    });
    await registry.revalidateConnections();
    await expect(membershipStream.reader.waitForEnd()).resolves.toBeUndefined();
    membershipStream.close();
    expect(registry.diagnostics().activeConnections).toBe(baselineConnections);
  });

  async function createAlert(organizationId: string, siteId: string, monitoringPointId: string) {
    return prisma.alert.create({
      data: {
        organizationId,
        siteId,
        monitoringPointId,
        deviceId: null,
        type: AlertType.RISK_DANGER,
        severity: 'CRITICAL',
        status: AlertStatus.ACTIVE,
        deduplicationKey: `${organizationId}/${siteId}/${monitoringPointId}/${randomUUID()}`,
        reasons: ['DANGER_TILT'],
        firstObservedAt: new Date(),
        lastObservedAt: new Date(),
      },
    });
  }

  async function acknowledge(alertId: string) {
    const actionId = randomUUID();
    const response = await lifecycle(
      baseA,
      ownerAToken,
      organizationAId,
      alertId,
      'acknowledge',
      actionId,
      {
        actionId,
        note: 'Diterima',
        fieldCondition: 'Stabil',
        sopExecuted: true,
      },
    );
    expect(response.status).toBe(200);
  }

  async function login(baseUrl: string, email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: process.env.WEB_URL! },
      body: JSON.stringify({ email, password }),
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as { accessToken: string }).accessToken;
  }

  function telemetryPayload(options: {
    readonly risk: FirmwareRiskLevel;
    readonly tilt: number;
    readonly timestamp?: string;
  }) {
    telemetrySequence += 1;
    return {
      messageId: `msg_${randomUUID()}`,
      bootId: `realtime-boot-${runId}-${telemetrySequence}`,
      sequence: telemetrySequence,
      timestamp: options.timestamp ?? new Date(Date.now() - 1_000).toISOString(),
      firmwareVersion: '5.0.0',
      network: { type: NetworkType.WIFI, signalRssi: -60 },
      readings: {
        tiltMagnitudeDeg: options.tilt,
        soilMoisturePct: 50,
        rainfallMmHour: 5,
        batteryVoltage: 12.5,
      },
      deviceAssessment: { riskLevel: options.risk, sirenActive: false },
    };
  }

  function ingestTelemetry(payload: ReturnType<typeof telemetryPayload>) {
    return instanceA.get(TelemetryService).ingest(
      {
        id: deviceId,
        organizationId: organizationAId,
        siteId: siteAId,
        monitoringPointId: pointAId,
        hardwareId,
        lifecycleStatus: DeviceLifecycleStatus.ENABLED,
        authenticatedCredentialHash: deviceCredentialHash,
      },
      payload.messageId,
      payload as TelemetryDto,
    );
  }
});

async function createApplication(): Promise<INestApplication> {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  return app;
}

function authHeaders(token: string, organizationId: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'X-Organization-Id': organizationId };
}

async function lifecycle(
  baseUrl: string,
  token: string,
  organizationId: string,
  alertId: string,
  endpoint: 'acknowledge' | 'resolve' | 'false-alarm',
  actionId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/alerts/${alertId}/${endpoint}`, {
    method: 'POST',
    headers: {
      ...authHeaders(token, organizationId),
      'Content-Type': 'application/json',
      'Idempotency-Key': actionId,
    },
    body: JSON.stringify(body),
  });
}

async function openStream(
  baseUrl: string,
  token: string,
  organizationId: string,
  extraHeaders: Record<string, string> = {},
) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/v1/realtime/stream`, {
    headers: { ...authHeaders(token, organizationId), ...extraHeaders },
    signal: controller.signal,
  });
  if (response.body === null) throw new Error('SSE response body unavailable');
  const reader = new SseReader(response.body.getReader());
  return { response, reader, close: () => controller.abort() };
}

class SseReader {
  private readonly frames: string[] = [];
  private buffer = '';
  private ended = false;

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {
    void this.pump();
  }

  async nextFrame(timeoutMilliseconds = 5_000): Promise<string> {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      const frame = this.frames.shift();
      if (frame !== undefined) return frame;
      if (this.ended) throw new Error('SSE ended');
      await delay(10);
    }
    throw new Error('SSE timeout');
  }

  async nextEvent(timeoutMilliseconds = 5_000): Promise<PublicRealtimeEvent> {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      const frame = await this.nextFrame(Math.max(1, deadline - Date.now()));
      if (frame.startsWith(':')) continue;
      const data = frame.split('\n').find((line) => line.startsWith('data: '));
      if (data !== undefined) return JSON.parse(data.slice(6)) as PublicRealtimeEvent;
    }
    throw new Error('SSE timeout');
  }

  async waitForEnd(timeoutMilliseconds = 2_000): Promise<void> {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      if (this.ended) return;
      await delay(10);
    }
    throw new Error('SSE timeout');
  }

  private async pump(): Promise<void> {
    const decoder = new TextDecoder();
    try {
      while (true) {
        const result = await this.reader.read();
        if (result.done) break;
        this.buffer += decoder.decode(result.value, { stream: true }).replaceAll('\r\n', '\n');
        let boundary = this.buffer.indexOf('\n\n');
        while (boundary >= 0) {
          this.frames.push(this.buffer.slice(0, boundary));
          this.buffer = this.buffer.slice(boundary + 2);
          boundary = this.buffer.indexOf('\n\n');
        }
      }
    } catch {
      // Abort is the expected test cleanup path.
    } finally {
      this.ended = true;
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function provisionalProfileData() {
  return {
    version: 1,
    calibrationStatus: 'PROVISIONAL' as const,
    safeTiltMagnitudeDegLt: 3,
    safeSoilMoisturePctLt: 65,
    safeRainfallMmHourLt: 20,
    dangerTiltMagnitudeDegGt: 8,
    dangerRainfallMmHourGt: 50,
    dangerSoilMoisturePctGt: 85,
    technicalTiltXDegMin: -180,
    technicalTiltXDegMax: 180,
    technicalTiltYDegMin: -180,
    technicalTiltYDegMax: 180,
    technicalTiltMagnitudeMin: 0,
    technicalTiltMagnitudeMax: 180,
    technicalSoilMoistureMin: 0,
    technicalSoilMoistureMax: 100,
    technicalRainfallMin: 0,
    technicalRainfallMax: 1000,
    technicalBatteryVoltageMin: 0,
    technicalBatteryVoltageMax: 30,
    technicalSignalRssiMin: -150,
    technicalSignalRssiMax: 0,
    onlineWithinMinutes: 20,
    offlineAfterMinutes: 35,
    watchConsecutiveSamples: 2,
    dangerConsecutiveSamples: 1,
    downgradeStableMinutes: 10,
    mismatchConsecutiveSamples: 3,
  };
}
