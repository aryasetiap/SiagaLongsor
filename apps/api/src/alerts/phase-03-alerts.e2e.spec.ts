import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request, {
  type Response as SuperTestResponse,
  type Test as SuperTestRequest,
} from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../app.module.js';
import { configureApp } from '../bootstrap/configure-app.js';
import { ConnectivityEvaluatorService } from '../connectivity/connectivity-evaluator.service.js';
import { DistributedLockService } from '../connectivity/distributed-lock.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { DeviceCredentialService } from '../devices/device-credential.service.js';
import {
  AlertType,
  DeviceLifecycleStatus,
  FirmwareRiskLevel,
  Role,
} from '../generated/prisma/enums.js';
import { RedisService } from '../redis/redis.service.js';
import { RealtimePostCommitService } from '../realtime/realtime-post-commit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { AlertObservationService } from './alert-observation.service.js';

describe('Phase 03 alerts, connectivity, and read APIs', () => {
  const runId = randomUUID();
  const organizationAId = `phase03-org-a-${runId}`;
  const organizationBId = `phase03-org-b-${runId}`;
  const siteAId = `phase03-site-a-${runId}`;
  const siteBId = `phase03-site-b-${runId}`;
  const telemetryPointId = `phase03-point-telemetry-${runId}`;
  const schedulerPointId = `phase03-point-scheduler-${runId}`;
  const racePointId = `phase03-point-race-${runId}`;
  const lockPointId = `phase03-point-lock-${runId}`;
  const disabledPointId = `phase03-point-disabled-${runId}`;
  const pointBId = `phase03-point-b-${runId}`;
  const ownerId = `phase03-owner-${runId}`;
  const adminId = `phase03-admin-${runId}`;
  const ownerEmail = `phase03-owner-${runId}@example.invalid`;
  const adminEmail = `phase03-admin-${runId}@example.invalid`;
  const password = `Phase03-password-${randomUUID()}`;
  const baseTime = new Date(Date.now() - 60 * 60_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let observations: AlertObservationService;
  let evaluator: ConnectivityEvaluatorService;
  let locks: DistributedLockService;
  let redis: RedisService;
  let credentials: DeviceCredentialService;
  let ownerToken: string;
  let adminToken: string;
  let telemetryDevice: Awaited<ReturnType<typeof createDevice>>;
  let schedulerDevice: Awaited<ReturnType<typeof createDevice>>;
  let raceDevice: Awaited<ReturnType<typeof createDevice>>;
  let telemetrySecret: string;
  let schedulerSecret: string;
  let raceSecret: string;
  let requestSequence = 0;
  let telemetrySequence = 0;

  beforeAll(async () => {
    setTestEnvironment();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaService);
    observations = app.get(AlertObservationService);
    evaluator = app.get(ConnectivityEvaluatorService);
    locks = app.get(DistributedLockService);
    redis = app.get(RedisService);
    credentials = app.get(DeviceCredentialService);
    http = request(app.getHttpServer());

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'Phase 03 Organization A', slug: `p3-a-${runId}` },
        { id: organizationBId, name: 'Phase 03 Organization B', slug: `p3-b-${runId}` },
      ],
    });
    await prisma.site.createMany({
      data: [
        {
          id: siteAId,
          organizationId: organizationAId,
          name: 'Site Phase 03 A',
          slug: `a-${runId}`,
        },
        {
          id: siteBId,
          organizationId: organizationBId,
          name: 'Site Phase 03 B',
          slug: `b-${runId}`,
        },
      ],
    });
    await prisma.monitoringPoint.createMany({
      data: [
        pointData(telemetryPointId, organizationAId, siteAId, 'Lereng Telemetry'),
        pointData(schedulerPointId, organizationAId, siteAId, 'Lereng Scheduler'),
        pointData(racePointId, organizationAId, siteAId, 'Lereng Race'),
        pointData(lockPointId, organizationAId, siteAId, 'Lereng Lock'),
        pointData(disabledPointId, organizationAId, siteAId, 'Lereng Disabled'),
        pointData(pointBId, organizationBId, siteBId, 'Lereng Rahasia B'),
      ],
    });
    await prisma.riskProfile.createMany({
      data: [
        { ...profileData(), organizationId: organizationAId, siteId: siteAId },
        { ...profileData(), organizationId: organizationBId, siteId: siteBId },
      ],
    });
    await prisma.user.createMany({
      data: [
        userData(ownerId, ownerEmail, 'Phase 03 Owner', passwordHash),
        userData(adminId, adminEmail, 'Phase 03 Admin', passwordHash),
      ],
    });
    await prisma.membership.createMany({
      data: [
        { organizationId: organizationAId, userId: ownerId, role: Role.PROJECT_OWNER },
        { organizationId: organizationBId, userId: ownerId, role: Role.PROJECT_OWNER },
        { organizationId: organizationAId, userId: adminId, role: Role.SCHOOL_ADMIN },
      ],
    });
    const telemetryIssued = await credentials.issue();
    telemetrySecret = telemetryIssued.raw;
    telemetryDevice = await createDevice(
      telemetryPointId,
      organizationAId,
      siteAId,
      telemetryIssued.hash,
      'TELEMETRY',
    );
    const schedulerIssued = await credentials.issue();
    schedulerSecret = schedulerIssued.raw;
    schedulerDevice = await createDevice(
      schedulerPointId,
      organizationAId,
      siteAId,
      schedulerIssued.hash,
      'SCHEDULER',
    );
    const raceIssued = await credentials.issue();
    raceSecret = raceIssued.raw;
    raceDevice = await createDevice(racePointId, organizationAId, siteAId, raceIssued.hash, 'RACE');
    await createDevice(
      disabledPointId,
      organizationAId,
      siteAId,
      (await credentials.issue()).hash,
      'DISABLED',
      DeviceLifecycleStatus.DISABLED,
    );
    await createDevice(
      pointBId,
      organizationBId,
      siteBId,
      (await credentials.issue()).hash,
      'ORG-B',
    );
    await createConnectivityProjection(schedulerDevice, schedulerPointId, 'scheduler');
    await createConnectivityProjection(raceDevice, racePointId, 'race');
    ownerToken = await login(ownerEmail);
    adminToken = await login(adminEmail);
  }, 40_000);

  afterAll(async () => {
    if (prisma !== undefined) {
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
      await prisma.refreshSession.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
      await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, adminId] } } });
      await prisma.monitoringPoint.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.site.deleteMany({ where: { id: { in: [siteAId, siteBId] } } });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationAId, organizationBId] } },
      });
    }
    await app?.close();
  });

  it('generates WATCH, DANGER, and thresholded mismatch alerts without duplicate/late effects', async () => {
    const firstWatch = payload({
      risk: FirmwareRiskLevel.WATCH,
      tilt: 4,
      moisture: 70,
      rainfall: 25,
    });
    const secondWatch = payload({
      risk: FirmwareRiskLevel.WATCH,
      tilt: 4,
      moisture: 70,
      rainfall: 25,
    });
    expect((await ingest(telemetryDevice.hardwareId, telemetrySecret, firstWatch)).status).toBe(
      201,
    );
    expect(await alertCount(AlertType.RISK_WATCH, telemetryPointId)).toBe(0);
    const secondResponse = await ingest(telemetryDevice.hardwareId, telemetrySecret, secondWatch);
    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body).not.toHaveProperty('serverRisk');
    expect(await alertCount(AlertType.RISK_WATCH, telemetryPointId)).toBe(1);

    const watchAlert = await prisma.alert.findFirstOrThrow({
      where: { monitoringPointId: telemetryPointId, type: AlertType.RISK_WATCH },
    });
    expect(watchAlert.occurrenceCount).toBe(1);
    expect((await ingest(telemetryDevice.hardwareId, telemetrySecret, secondWatch)).status).toBe(
      200,
    );
    expect(
      (await prisma.alert.findUniqueOrThrow({ where: { id: watchAlert.id } })).occurrenceCount,
    ).toBe(1);

    const late = payload({
      risk: FirmwareRiskLevel.DANGER,
      tilt: 9,
      timestamp: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect((await ingest(telemetryDevice.hardwareId, telemetrySecret, late)).status).toBe(201);
    expect(await alertCount(AlertType.RISK_DANGER, telemetryPointId)).toBe(0);

    for (let index = 0; index < 4; index += 1) {
      const danger = payload({ risk: FirmwareRiskLevel.SAFE, tilt: 9 });
      expect((await ingest(telemetryDevice.hardwareId, telemetrySecret, danger)).status).toBe(201);
    }
    const [dangerAlert, mismatchAlert] = await Promise.all([
      prisma.alert.findFirstOrThrow({
        where: { monitoringPointId: telemetryPointId, type: AlertType.RISK_DANGER },
      }),
      prisma.alert.findFirstOrThrow({
        where: {
          monitoringPointId: telemetryPointId,
          type: AlertType.DEVICE_SERVER_MISMATCH,
        },
      }),
    ]);
    expect(dangerAlert.id).not.toBe(watchAlert.id);
    expect(dangerAlert.occurrenceCount).toBe(4);
    expect(mismatchAlert.occurrenceCount).toBe(2);
    expect(await prisma.alertEvent.count({ where: { alertId: dangerAlert.id } })).toBe(4);
  });

  it('atomically deduplicates concurrent observations and appends immutable events', async () => {
    const observe = (observationKey: string) =>
      prisma.$transaction((transaction) =>
        observations.observe(transaction, {
          organizationId: organizationAId,
          siteId: siteAId,
          monitoringPointId: lockPointId,
          deviceId: null,
          type: AlertType.DEVICE_DELAYED,
          reasons: ['TELEMETRY_DELAYED'],
          observedAt: baseTime,
          observationKey,
        }),
      );
    await Promise.all([observe(`concurrent-a-${runId}`), observe(`concurrent-b-${runId}`)]);
    const alert = await prisma.alert.findFirstOrThrow({
      where: { monitoringPointId: lockPointId, type: AlertType.DEVICE_DELAYED },
    });
    expect(alert.occurrenceCount).toBe(2);
    expect(await prisma.alertEvent.count({ where: { alertId: alert.id } })).toBe(2);
    await observe(`concurrent-a-${runId}`);
    expect(
      (await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).occurrenceCount,
    ).toBe(2);
    await expect(
      prisma.alertEvent.updateMany({
        where: { alertId: alert.id },
        data: { eventType: 'MUTATION_FORBIDDEN' },
      }),
    ).rejects.toThrow();
  });

  it('uses a real Redis ownership lock with contention, owner-safe release, and expiry', async () => {
    const key = `phase03-lock-${runId}`;
    let releaseWork!: () => void;
    const blocker = new Promise<void>((resolve) => {
      releaseWork = resolve;
    });
    const first = locks.runWithLock(key, 5_000, async () => blocker);
    await waitForRedisValue(key);
    await expect(locks.runWithLock(key, 5_000, async () => undefined)).resolves.toEqual({
      acquired: false,
    });
    expect(await locks.release(key, 'not-owner')).toBe(false);
    expect(await redis.client.exists(key)).toBe(1);
    releaseWork();
    expect((await first).acquired).toBe(true);

    await redis.client.set(key, 'expired-owner', 'PX', 50);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await expect(locks.runWithLock(key, 1_000, async () => 'after-expiry')).resolves.toEqual({
      acquired: true,
      value: 'after-expiry',
    });
  });

  it('evaluates DELAYED/OFFLINE idempotently and recovery stays unresolved', async () => {
    const dispatch = vi
      .spyOn(app.get(RealtimePostCommitService), 'dispatch')
      .mockResolvedValue(undefined);
    const delayedAt = new Date(baseTime.getTime() + 21 * 60_000);
    expect(await evaluator.runOnce(delayedAt)).toMatchObject({ acquired: true });
    let state = await prisma.currentMonitoringPointState.findUniqueOrThrow({
      where: { monitoringPointId: schedulerPointId },
    });
    expect(state).toMatchObject({ connectivityStatus: 'DELAYED', serverRisk: 'UNKNOWN' });
    const delayed = await prisma.alert.findFirstOrThrow({
      where: { monitoringPointId: schedulerPointId, type: AlertType.DEVICE_DELAYED },
    });
    expect(delayed.occurrenceCount).toBe(1);
    const descriptorsAfterDelayed = dispatch.mock.calls.flatMap(([descriptors]) => descriptors);
    expect(descriptorsAfterDelayed.map((entry) => entry.eventType)).toEqual(
      expect.arrayContaining(['MONITORING_POINT_STATE_CHANGED', 'ALERT_CREATED']),
    );
    await evaluator.runOnce(delayedAt);
    expect(
      (await prisma.alert.findUniqueOrThrow({ where: { id: delayed.id } })).occurrenceCount,
    ).toBe(1);
    expect(dispatch.mock.calls.flatMap(([descriptors]) => descriptors)).toHaveLength(
      descriptorsAfterDelayed.length,
    );

    const offlineAt = new Date(baseTime.getTime() + 36 * 60_000);
    await evaluator.runOnce(offlineAt);
    state = await prisma.currentMonitoringPointState.findUniqueOrThrow({
      where: { monitoringPointId: schedulerPointId },
    });
    expect(state).toMatchObject({ connectivityStatus: 'OFFLINE', serverRisk: 'UNKNOWN' });
    const offline = await prisma.alert.findFirstOrThrow({
      where: { monitoringPointId: schedulerPointId, type: AlertType.DEVICE_OFFLINE },
    });
    expect(offline.status).toBe('ACTIVE');
    expect(dispatch.mock.calls.flatMap(([descriptors]) => descriptors)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'MONITORING_POINT_STATE_CHANGED',
          monitoringPointId: schedulerPointId,
        }),
      ]),
    );

    expect(
      (
        await ingest(
          schedulerDevice.hardwareId,
          schedulerSecret,
          payload({
            risk: FirmwareRiskLevel.DANGER,
            tilt: 9,
            timestamp: new Date(baseTime.getTime() - 60_000).toISOString(),
          }),
        )
      ).status,
    ).toBe(201);
    state = await prisma.currentMonitoringPointState.findUniqueOrThrow({
      where: { monitoringPointId: schedulerPointId },
    });
    expect(state.connectivityStatus).toBe('OFFLINE');

    expect(
      (
        await ingest(
          schedulerDevice.hardwareId,
          schedulerSecret,
          payload({ risk: FirmwareRiskLevel.SAFE, tilt: 1 }),
        )
      ).status,
    ).toBe(201);
    state = await prisma.currentMonitoringPointState.findUniqueOrThrow({
      where: { monitoringPointId: schedulerPointId },
    });
    expect(state.connectivityStatus).toBe('ONLINE');
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: offline.id } })).status).toBe(
      'ACTIVE',
    );
    dispatch.mockRestore();
    const recoveryReceivedAt = (
      await prisma.telemetry.findFirstOrThrow({
        where: { deviceId: schedulerDevice.id },
        orderBy: { serverReceivedAt: 'desc' },
      })
    ).serverReceivedAt;
    await evaluator.runOnce(new Date(recoveryReceivedAt.getTime() + 36 * 60_000));
    state = await prisma.currentMonitoringPointState.findUniqueOrThrow({
      where: { monitoringPointId: schedulerPointId },
    });
    expect(state.connectivityStatus).toBe('OFFLINE');
    expect(
      (
        await ingest(
          telemetryDevice.hardwareId,
          telemetrySecret,
          payload({ risk: FirmwareRiskLevel.SAFE, tilt: 9 }),
        )
      ).status,
    ).toBe(201);
    expect(await alertCount(AlertType.DEVICE_OFFLINE, disabledPointId)).toBe(0);
  });

  it('serializes ingestion and connectivity evaluation on the same Device without stale state', async () => {
    const initialState = await prisma.currentMonitoringPointState.findUniqueOrThrow({
      where: { monitoringPointId: racePointId },
    });
    const oldReceivedAt = new Date(Date.now() - 60 * 60_000);
    await prisma.telemetry.update({
      where: { id: initialState.latestTelemetryId as string },
      data: { serverReceivedAt: oldReceivedAt },
    });

    let releaseDeviceLock!: () => void;
    let confirmDeviceLock!: () => void;
    const deviceLockAcquired = new Promise<void>((resolve) => {
      confirmDeviceLock = resolve;
    });
    const releaseGate = new Promise<void>((resolve) => {
      releaseDeviceLock = resolve;
    });
    const blocker = prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw(Prisma.sql`
          SELECT "id"
          FROM "Device"
          WHERE "id" = ${raceDevice.id}
          FOR UPDATE
        `);
        confirmDeviceLock();
        await releaseGate;
      },
      { timeout: 15_000 },
    );
    await deviceLockAcquired;

    const baselineWaiters = await databaseLockWaiterCount();
    const evaluationTime = new Date();
    const evaluationPromise = evaluator.runOnce(evaluationTime);
    await waitForDatabaseLockWaiters(baselineWaiters + 1);

    const currentPayload = payload({ risk: FirmwareRiskLevel.SAFE, tilt: 1 });
    const ingestionPromise = Promise.resolve(
      ingest(raceDevice.hardwareId, raceSecret, currentPayload),
    );
    try {
      await waitForDatabaseLockWaiters(baselineWaiters + 2);
    } finally {
      releaseDeviceLock();
    }

    const [evaluation, ingestion] = await Promise.all([evaluationPromise, ingestionPromise]);
    await blocker;
    expect(evaluation.acquired).toBe(true);
    expect(ingestion.status).toBe(201);
    expect(ingestion.body.duplicate).toBe(false);

    const currentTelemetryId = ingestion.body.telemetryId as string;
    let currentState = await prisma.currentMonitoringPointState.findUniqueOrThrow({
      where: { monitoringPointId: racePointId },
    });
    expect(currentState.latestTelemetryId).toBe(currentTelemetryId);
    expect(currentState.connectivityStatus).toBe('ONLINE');
    expect(
      await prisma.telemetry.count({
        where: { deviceId: raceDevice.id, messageId: currentPayload.messageId },
      }),
    ).toBe(1);
    expect(await prisma.riskAssessment.count({ where: { telemetryId: currentTelemetryId } })).toBe(
      1,
    );

    const alertCountAfterRace = await prisma.alert.count({
      where: { monitoringPointId: racePointId },
    });
    const eventCountAfterRace = await prisma.alertEvent.count({
      where: { alert: { monitoringPointId: racePointId } },
    });
    expect((await ingest(raceDevice.hardwareId, raceSecret, currentPayload)).status).toBe(200);

    const latePayload = payload({
      risk: FirmwareRiskLevel.DANGER,
      tilt: 9,
      timestamp: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const [repeatedEvaluation, lateIngestion] = await Promise.all([
      evaluator.runOnce(new Date()),
      ingest(raceDevice.hardwareId, raceSecret, latePayload),
    ]);
    expect(repeatedEvaluation.acquired).toBe(true);
    expect(lateIngestion.status).toBe(201);
    const lateTelemetryId = lateIngestion.body.telemetryId as string;
    const lateAssessment = await prisma.riskAssessment.findUniqueOrThrow({
      where: { telemetryId: lateTelemetryId },
    });
    expect(lateAssessment.affectsCurrentState).toBe(false);
    expect(await prisma.riskAssessment.count({ where: { telemetryId: lateTelemetryId } })).toBe(1);

    const idempotentTime = new Date();
    await evaluator.runOnce(idempotentTime);
    await evaluator.runOnce(idempotentTime);
    currentState = await prisma.currentMonitoringPointState.findUniqueOrThrow({
      where: { monitoringPointId: racePointId },
    });
    expect(currentState.latestTelemetryId).toBe(currentTelemetryId);
    expect(currentState.connectivityStatus).toBe('ONLINE');
    expect(await prisma.alert.count({ where: { monitoringPointId: racePointId } })).toBe(
      alertCountAfterRace,
    );
    expect(
      await prisma.alertEvent.count({
        where: { alert: { monitoringPointId: racePointId } },
      }),
    ).toBe(eventCountAfterRace);
    const alertsByType = await prisma.alert.groupBy({
      by: ['type'],
      where: { monitoringPointId: racePointId },
      _count: { _all: true },
    });
    expect(alertsByType.every((group) => group._count._all === 1)).toBe(true);
  }, 20_000);

  it('serves overview to both roles with filters, stable cursor, and organization isolation', async () => {
    const [owner, admin, filtered] = await Promise.all([
      get('/api/v1/monitoring-overview?limit=2', ownerToken, organizationAId),
      get('/api/v1/monitoring-overview?limit=2', adminToken, organizationAId),
      get(
        `/api/v1/monitoring-overview?siteId=${siteAId}&riskLevel=DANGER&connectivityStatus=ONLINE&search=Lereng`,
        ownerToken,
        organizationAId,
      ),
    ]);
    expect(owner.status).toBe(200);
    expect(admin.status).toBe(200);
    expect(owner.body.data).toHaveLength(2);
    expect(owner.body.page.hasMore).toBe(true);
    expect(owner.body).not.toHaveProperty('totalCount');
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.length).toBeGreaterThan(0);
    expect(
      filtered.body.data.every(
        (item: { currentState: { serverRisk: string; connectivityStatus: string } }) =>
          item.currentState.serverRisk === 'DANGER' &&
          item.currentState.connectivityStatus === 'ONLINE',
      ),
    ).toBe(true);
    expect(JSON.stringify(owner.body)).not.toContain('Lereng Rahasia B');
    expect(JSON.stringify(owner.body)).not.toContain('credentialHash');
    expect(JSON.stringify(owner.body)).not.toContain('rawPayload');

    const cursor = encodeURIComponent(owner.body.page.nextCursor as string);
    const next = await get(
      `/api/v1/monitoring-overview?limit=2&cursor=${cursor}`,
      ownerToken,
      organizationAId,
    );
    expect(next.status).toBe(200);
    expect(next.body.data[0].monitoringPoint.id).not.toBe(owner.body.data[0].monitoringPoint.id);
    const crossCursor = await get(
      `/api/v1/monitoring-overview?limit=2&cursor=${cursor}`,
      ownerToken,
      organizationBId,
    );
    expect(crossCursor.status).toBe(400);
    expect(crossCursor.body.error.code).toBe('INVALID_CURSOR');
  });

  it('serves newest-first assessment history including late data and isolates organizations', async () => {
    const response = await get(
      `/api/v1/monitoring-points/${telemetryPointId}/risk-assessments?limit=100`,
      adminToken,
      organizationAId,
    );
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(2);
    expect(
      response.body.data.some(
        (assessment: { affectsCurrentState: boolean }) => !assessment.affectsCurrentState,
      ),
    ).toBe(true);
    expect(response.body).not.toHaveProperty('totalCount');
    const times = response.body.data.map((item: { evaluatedAt: string }) => item.evaluatedAt);
    expect(times).toEqual([...times].sort().reverse());

    const cross = await get(
      `/api/v1/monitoring-points/${pointBId}/risk-assessments`,
      ownerToken,
      organizationAId,
    );
    expect(cross.status).toBe(404);
    expect(cross.body.error.code).toBe('MONITORING_POINT_NOT_FOUND');
  });

  it('serves filtered Alert pages/detail to both roles without cross-organization leakage', async () => {
    await prisma.$transaction((transaction) =>
      observations.observe(transaction, {
        organizationId: organizationBId,
        siteId: siteBId,
        monitoringPointId: pointBId,
        deviceId: null,
        type: AlertType.RISK_DANGER,
        reasons: ['DANGER_TILT'],
        observedAt: baseTime,
        observationKey: `org-b-alert-${runId}`,
      }),
    );
    const [owner, admin, filtered] = await Promise.all([
      get('/api/v1/alerts?limit=2', ownerToken, organizationAId),
      get('/api/v1/alerts?limit=2', adminToken, organizationAId),
      get(
        `/api/v1/alerts?siteId=${siteAId}&monitoringPointId=${telemetryPointId}&type=RISK_DANGER&severity=CRITICAL&status=ACTIVE`,
        ownerToken,
        organizationAId,
      ),
    ]);
    expect(owner.status).toBe(200);
    expect(admin.status).toBe(200);
    expect(owner.body.page.hasMore).toBe(true);
    expect(owner.body).not.toHaveProperty('totalCount');
    expect(filtered.body.data).toHaveLength(1);
    const alertId = filtered.body.data[0].id as string;
    const detail = await get(`/api/v1/alerts/${alertId}`, adminToken, organizationAId);
    expect(detail.status).toBe(200);
    expect(Object.keys(detail.body.data).sort()).toEqual(
      [
        'id',
        'organizationId',
        'site',
        'monitoringPoint',
        'deviceId',
        'type',
        'severity',
        'status',
        'reasons',
        'occurrenceCount',
        'firstObservedAt',
        'lastObservedAt',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
    const orgBAlert = await prisma.alert.findFirstOrThrow({
      where: { organizationId: organizationBId },
    });
    const cross = await get(`/api/v1/alerts/${orgBAlert.id}`, ownerToken, organizationAId);
    expect(cross.status).toBe(404);
    expect(cross.body.error.code).toBe('ALERT_NOT_FOUND');
    expect(JSON.stringify(owner.body)).not.toContain(organizationBId);
    expect(JSON.stringify(detail.body)).not.toContain(telemetrySecret);
  });

  async function createConnectivityProjection(
    device: Awaited<ReturnType<typeof createDevice>>,
    monitoringPointId: string,
    suffix: string,
  ): Promise<void> {
    const telemetry = await prisma.telemetry.create({
      data: {
        deviceId: device.id,
        monitoringPointId,
        messageId: `${suffix}-message-${runId}`,
        bootId: `${suffix}-boot-${runId}`,
        sequence: 1,
        deviceTimestamp: baseTime,
        serverReceivedAt: baseTime,
        firmwareVersion: '1.0.0',
        tiltMagnitudeDeg: 1,
        soilMoisturePct: 40,
        rainfallMmHour: 5,
        batteryVoltage: 12,
        firmwareRiskLevel: FirmwareRiskLevel.SAFE,
        firmwareSirenActive: false,
        canonicalPayloadHash: 'a'.repeat(64),
        rawPayload: {},
      },
    });
    const profile = await prisma.riskProfile.findFirstOrThrow({
      where: { siteId: siteAId, isActive: true },
    });
    await prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: baseTime, lastTelemetryAt: baseTime },
    });
    await prisma.currentMonitoringPointState.create({
      data: {
        monitoringPointId,
        organizationId: organizationAId,
        siteId: siteAId,
        deviceId: device.id,
        serverRisk: 'SAFE',
        connectivityStatus: 'ONLINE',
        reasons: ['SAFE_THRESHOLDS_MET'],
        latestTelemetryId: telemetry.id,
        evaluatedAt: baseTime,
        lastTelemetryAt: baseTime,
        riskProfileId: profile.id,
        riskProfileVersion: profile.version,
      },
    });
  }

  async function createDevice(
    monitoringPointId: string,
    organizationId: string,
    siteId: string,
    credentialHash: string,
    suffix: string,
    lifecycleStatus: DeviceLifecycleStatus = DeviceLifecycleStatus.ENABLED,
  ) {
    return prisma.device.create({
      data: {
        organizationId,
        siteId,
        monitoringPointId,
        hardwareId: `P3_${suffix}_${runId}`.toUpperCase(),
        displayName: `Phase 03 Device ${suffix}`,
        credentialHash,
        lifecycleStatus,
        ...(lifecycleStatus === DeviceLifecycleStatus.DISABLED ? { disabledAt: new Date() } : {}),
      },
    });
  }

  async function login(email: string): Promise<string> {
    const response = await send(http.post('/api/v1/auth/login').send({ email, password }));
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  function get(path: string, token: string, organizationId: string) {
    return send(
      http
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', organizationId),
    );
  }

  function ingest(
    hardwareId: string,
    secret: string,
    body: ReturnType<typeof payload>,
  ): Promise<SuperTestResponse> {
    return send(
      http
        .post('/api/v1/iot/telemetry')
        .set('Authorization', `Device ${hardwareId}.${secret}`)
        .set('Idempotency-Key', body.messageId)
        .send(body),
    );
  }

  function send(agent: SuperTestRequest): Promise<SuperTestResponse> {
    requestSequence += 1;
    return agent.set('x-request-id', `phase03-${runId}-${requestSequence}`);
  }

  function payload(
    options: {
      risk?: FirmwareRiskLevel;
      tilt?: number;
      moisture?: number;
      rainfall?: number;
      timestamp?: string;
    } = {},
  ) {
    telemetrySequence += 1;
    return {
      messageId: `p3_msg_${runId}_${telemetrySequence}`,
      bootId: `p3_boot_${runId}`,
      sequence: telemetrySequence,
      timestamp: options.timestamp ?? new Date(Date.now() - 100).toISOString(),
      firmwareVersion: '1.0.0',
      network: { type: 'WIFI', signalRssi: -60 },
      readings: {
        tiltXDeg: 0,
        tiltYDeg: 0,
        tiltMagnitudeDeg: options.tilt ?? 1,
        soilMoisturePct: options.moisture ?? 40,
        rainfallMmHour: options.rainfall ?? 5,
        batteryVoltage: 12,
      },
      deviceAssessment: {
        riskLevel: options.risk ?? FirmwareRiskLevel.SAFE,
        sirenActive: false,
      },
    };
  }

  function alertCount(type: AlertType, monitoringPointId: string) {
    return prisma.alert.count({ where: { monitoringPointId, type } });
  }

  async function waitForRedisValue(key: string): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if ((await redis.client.exists(key)) === 1) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Redis lock was not acquired in time.');
  }

  async function databaseLockWaiterCount(): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT count(*)::bigint AS "count"
      FROM pg_stat_activity
      WHERE "datname" = current_database()
        AND "pid" <> pg_backend_pid()
        AND "wait_event_type" = 'Lock'
    `);
    return Number(rows[0]?.count ?? 0);
  }

  async function waitForDatabaseLockWaiters(expected: number): Promise<void> {
    for (let attempt = 0; attempt < 250; attempt += 1) {
      if ((await databaseLockWaiterCount()) >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Expected at least ${expected} PostgreSQL lock waiters.`);
  }
});

function pointData(id: string, organizationId: string, siteId: string, name: string) {
  return { id, organizationId, siteId, name, locationDescription: `Lokasi ${name}` };
}

function userData(id: string, email: string, name: string, passwordHash: string) {
  return { id, email, normalizedEmail: email.toLowerCase(), name, passwordHash };
}

function profileData() {
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

function setTestEnvironment(): void {
  process.env.NODE_ENV = 'test';
  process.env.WEB_URL = 'http://localhost:3000';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.AUTH_ACCESS_TOKEN_SECRET = 'integration-only-access-secret-at-least-32-chars';
  process.env.AUTH_JWT_ISSUER = 'siagalongsor-api-test';
  process.env.AUTH_JWT_AUDIENCE = 'siagalongsor-web-test';
  process.env.AUTH_LOGIN_RATE_LIMIT_MAX = '100';
  process.env.AUTH_LOGIN_RATE_LIMIT_TTL_MS = '60000';
  process.env.TELEMETRY_RATE_LIMIT_MAX = '1000';
}
