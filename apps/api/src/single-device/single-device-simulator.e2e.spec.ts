import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { configureApp } from '../bootstrap/configure-app.js';
import {
  runSimulator,
  type SimulatorConfig,
  type SimulatorLogEntry,
} from '../device-simulator/device-simulator.js';
import { PrismaService } from '../database/prisma.service.js';
import { DeviceCredentialService } from '../devices/device-credential.service.js';
import { ConnectivityEvaluatorService } from '../connectivity/connectivity-evaluator.service.js';
import { Role } from '../generated/prisma/enums.js';

describe('R4 simulator single-device HTTP acceptance', () => {
  const run = randomUUID();
  const organizationId = `r4-org-${run}`;
  const siteId = `r4-site-${run}`;
  const pointId = `r4-point-${run}`;
  const userId = `r4-owner-${run}`;
  const email = `r4-owner-${run}@example.invalid`;
  const password = `R4-password-${run}`;
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let config: SimulatorConfig;
  let baseUrl: string;

  beforeAll(async () => {
    environment();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.organization.create({
      data: { id: organizationId, name: 'R4 E2E', slug: `r4-${run}` },
    });
    await prisma.site.create({
      data: { id: siteId, organizationId, name: 'R4 Site', slug: `r4-site-${run}` },
    });
    await prisma.monitoringPoint.create({
      data: { id: pointId, organizationId, siteId, name: 'R4 Point' },
    });
    await prisma.user.create({
      data: { id: userId, email, normalizedEmail: email, name: 'R4 Owner', passwordHash },
    });
    await prisma.membership.create({ data: { organizationId, userId, role: Role.PROJECT_OWNER } });
    await prisma.riskProfile.create({
      data: {
        organizationId,
        siteId,
        version: 1,
        calibrationStatus: 'PROVISIONAL',
        safeTiltMagnitudeDegLt: 3,
        safeSoilMoisturePctLt: 50,
        safeRainfallMmHourLt: 10,
        dangerTiltMagnitudeDegGt: 8,
        dangerSoilMoisturePctGt: 80,
        dangerRainfallMmHourGt: 30,
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
        watchConsecutiveSamples: 1,
        dangerConsecutiveSamples: 1,
        downgradeStableMinutes: 0,
        mismatchConsecutiveSamples: 1,
      },
    });
    const issued = await app.get(DeviceCredentialService).issue();
    const hardwareId = `R4_${run}`.toUpperCase();
    await prisma.device.create({
      data: {
        organizationId,
        siteId,
        monitoringPointId: pointId,
        hardwareId,
        displayName: 'R4 Device',
        credentialHash: issued.hash,
        credentialRotatedAt: issued.issuedAt,
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    token = login.body.accessToken as string;
    config = {
      apiBaseUrl: baseUrl,
      hardwareId,
      deviceSecret: issued.raw,
      scenario: 'normal',
      count: 1,
      intervalMs: 0,
      sequenceStart: 1,
      readings: {
        tiltMagnitudeDeg: 0,
        soilMoisturePct: 10,
        rainfallMmHour: 1,
        batteryVoltage: 12.7,
      },
    };
  }, 30_000);

  afterAll(async () => {
    if (prisma !== undefined) {
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.currentMonitoringPointState.deleteMany({ where: { organizationId } });
      await prisma.riskAssessment.deleteMany({ where: { organizationId } });
      await prisma.telemetry.deleteMany({ where: { device: { organizationId } } });
      await prisma.device.deleteMany({ where: { organizationId } });
      await prisma.monitoringPoint.deleteMany({ where: { organizationId } });
      await prisma.riskProfile.deleteMany({ where: { organizationId } });
      await prisma.refreshSession.deleteMany({ where: { userId } });
      await prisma.membership.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.site.deleteMany({ where: { id: siteId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await app?.close();
  });

  it('drives simulator telemetry through SAFE, WATCH, DANGER, UNKNOWN, and recovery', async () => {
    const http = request(baseUrl.replace('/api/v1', ''));
    const authorization = `Bearer ${token}`;
    const get = (path: string) => http.get(`/api/v1${path}`).set('Authorization', authorization);
    const auditCount = () =>
      prisma.auditLog.count({ where: { organizationId, eventType: 'RISK_STATUS_CHANGED' } });
    const send = async (
      readings: SimulatorConfig['readings'],
      scenario: SimulatorConfig['scenario'] = 'normal',
    ) => {
      await runSimulator({ ...config, readings, scenario });
    };

    await send(config.readings);
    const [overview, device, audit] = await Promise.all([
      get('/overview'),
      get('/device'),
      get('/audit-log'),
    ]);
    expect(overview.status).toBe(200);
    expect(overview.body.data).toMatchObject({
      configured: true,
      risk: { status: 'SAFE' },
      readings: {
        tiltMagnitudeDeg: config.readings.tiltMagnitudeDeg,
        soilMoisturePct: config.readings.soilMoisturePct,
        rainfallMmHour: config.readings.rainfallMmHour,
      },
    });
    expect(overview.body.data.series.tiltMagnitudeDeg).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 0 })]),
    );
    expect(device.status).toBe(200);
    expect(device.body.data).toMatchObject({
      configured: true,
      connectivity: 'ONLINE',
      firmwareVersion: 'simulator-1.0.0',
      batteryVoltage: 12.7,
      sensors: { tilt: 'READABLE', soilMoisture: 'READABLE', rainfall: 'READABLE' },
    });
    expect(device.body.data.network).toMatchObject({ type: 'WIFI', signalRssi: -67 });
    expect(audit.status).toBe(200);
    expect(JSON.stringify(audit.body)).not.toMatch(/credential|authorization|secret/i);

    const baseline = await auditCount();
    await send({ ...config.readings, tiltMagnitudeDeg: 3 });
    expect((await get('/overview')).body.data.risk.status).toBe('WATCH');
    expect((await get('/overview')).body.data.readings.tiltMagnitudeDeg).toBe(3);
    expect((await get('/device')).body.data.sensors).toEqual({
      tilt: 'READABLE',
      soilMoisture: 'READABLE',
      rainfall: 'READABLE',
    });
    expect(await auditCount()).toBe(baseline + 1);
    expect((await get('/audit-log')).body.data[0]).toMatchObject({
      previousStatus: 'SAFE',
      currentStatus: 'WATCH',
    });

    await send({ ...config.readings, tiltMagnitudeDeg: 8 });
    expect((await get('/overview')).body.data.risk.status).toBe('DANGER');
    expect(await auditCount()).toBe(baseline + 2);
    expect((await get('/audit-log')).body.data[0]).toMatchObject({
      previousStatus: 'WATCH',
      currentStatus: 'DANGER',
    });

    await send(config.readings, 'missing-tilt');
    const unknownOverview = await get('/overview');
    expect(unknownOverview.body.data.risk.status).toBe('UNKNOWN');
    expect(unknownOverview.body.data.readings.tiltMagnitudeDeg).toBeNull();
    expect(typeof unknownOverview.body.data.readings.tiltMagnitudeDeg).not.toBe('number');
    expect((await get('/device')).body.data.sensors).toMatchObject({
      tilt: 'UNREADABLE',
      soilMoisture: 'READABLE',
      rainfall: 'READABLE',
    });
    expect(await auditCount()).toBe(baseline + 3);
    expect((await get('/audit-log')).body.data[0]).toMatchObject({
      previousStatus: 'DANGER',
      currentStatus: 'UNKNOWN',
    });

    await send(config.readings);
    const recovered = await get('/overview');
    expect(recovered.body.data.risk.status).toBe('SAFE');
    expect(recovered.body.data.readings).toMatchObject({
      tiltMagnitudeDeg: 0,
      soilMoisturePct: 10,
      rainfallMmHour: 1,
    });
    expect((await get('/device')).body.data.sensors).toEqual({
      tilt: 'READABLE',
      soilMoisture: 'READABLE',
      rainfall: 'READABLE',
    });
    expect(await auditCount()).toBe(baseline + 4);
    expect((await get('/audit-log')).body.data[0]).toMatchObject({
      previousStatus: 'UNKNOWN',
      currentStatus: 'SAFE',
    });

    const duplicateBefore = {
      telemetry: await prisma.telemetry.count({ where: { device: { organizationId } } }),
      assessments: await prisma.riskAssessment.count({ where: { organizationId } }),
      audits: await auditCount(),
    };
    const duplicateLogs: SimulatorLogEntry[] = [];
    await runSimulator(
      { ...config, scenario: 'duplicate' },
      { log: (entry) => duplicateLogs.push(entry) },
    );
    expect(duplicateLogs.map((entry) => [entry.httpStatus, entry.duplicate])).toEqual([
      [201, false],
      [200, true],
    ]);
    expect(await prisma.telemetry.count({ where: { device: { organizationId } } })).toBe(
      duplicateBefore.telemetry + 1,
    );
    expect(await prisma.riskAssessment.count({ where: { organizationId } })).toBe(
      duplicateBefore.assessments + 1,
    );
    expect(await auditCount()).toBe(duplicateBefore.audits);
    expect((await get('/overview')).body.data.risk.status).toBe('SAFE');

    const lateBefore = {
      telemetry: await prisma.telemetry.count({ where: { device: { organizationId } } }),
      audits: await auditCount(),
    };
    const lateLogs: SimulatorLogEntry[] = [];
    await runSimulator({ ...config, scenario: 'late' }, { log: (entry) => lateLogs.push(entry) });
    const lateTelemetryIds = lateLogs
      .map((entry) => entry.telemetryId)
      .filter((id): id is string => id !== undefined);
    expect(lateTelemetryIds).toHaveLength(2);
    const lateTelemetryId = lateTelemetryIds[1];
    if (lateTelemetryId === undefined)
      throw new Error('Simulator late scenario did not report two telemetry IDs.');
    expect(await prisma.telemetry.count({ where: { device: { organizationId } } })).toBe(
      lateBefore.telemetry + 2,
    );
    const lateAssessment = await prisma.riskAssessment.findUniqueOrThrow({
      where: { telemetryId: lateTelemetryId },
    });
    expect(lateAssessment.affectsCurrentState).toBe(false);
    expect(
      (
        await prisma.currentMonitoringPointState.findUniqueOrThrow({
          where: { monitoringPointId: pointId },
        })
      ).latestTelemetryId,
    ).not.toBe(lateTelemetryId);
    expect(await auditCount()).toBe(lateBefore.audits);
    expect((await get('/overview')).body.data.risk.status).toBe('SAFE');

    const batteryAuditCount = await auditCount();
    await send({ ...config.readings, batteryVoltage: 29 });
    expect((await get('/overview')).body.data.risk.status).toBe('SAFE');
    expect(await auditCount()).toBe(batteryAuditCount);
    expect((await get('/device')).body.data.batteryVoltage).toBe(29);
    expect((await get('/overview')).body.data.readings.tiltMagnitudeDeg).toBe(0);

    const evaluator = app.get(ConnectivityEvaluatorService);
    const latestState = await prisma.currentMonitoringPointState.findUniqueOrThrow({
      where: { monitoringPointId: pointId },
    });
    const latestTelemetryId = latestState.latestTelemetryId;
    if (latestTelemetryId === null) throw new Error('Expected authoritative telemetry.');
    const delayedAt = new Date(Date.now() - 25 * 60 * 1000);
    await prisma.telemetry.update({
      where: { id: latestTelemetryId },
      data: { serverReceivedAt: delayedAt },
    });
    const delayedAuditCount = await auditCount();
    await expect(evaluator.runOnce(new Date())).resolves.toMatchObject({ acquired: true });
    const delayedState = await prisma.currentMonitoringPointState.findUniqueOrThrow({
      where: { monitoringPointId: pointId },
    });
    expect(delayedState.connectivityStatus).toBe('DELAYED');
    expect(delayedState.serverRisk).toBe('UNKNOWN');
    expect(await auditCount()).toBe(delayedAuditCount + 1);

    await prisma.telemetry.update({
      where: { id: latestTelemetryId },
      data: { serverReceivedAt: new Date(Date.now() - 45 * 60 * 1000) },
    });
    const offlineAuditCount = await auditCount();
    await expect(evaluator.runOnce(new Date())).resolves.toMatchObject({ acquired: true });
    const offlineState = await prisma.currentMonitoringPointState.findUniqueOrThrow({
      where: { monitoringPointId: pointId },
    });
    expect(offlineState.connectivityStatus).toBe('OFFLINE');
    expect(offlineState.serverRisk).toBe('UNKNOWN');
    expect(await auditCount()).toBe(offlineAuditCount);
  });
});

function environment(): void {
  process.env.NODE_ENV = 'test';
  process.env.WEB_URL = 'http://localhost:3000';
  process.env.AUTH_ACCESS_TOKEN_SECRET = 'r4-integration-access-secret-at-least-32-chars';
  process.env.AUTH_JWT_ISSUER = 'siagalongsor-api-test';
  process.env.AUTH_JWT_AUDIENCE = 'siagalongsor-web-test';
  process.env.AUTH_LOGIN_RATE_LIMIT_MAX = '100';
  process.env.TELEMETRY_RATE_LIMIT_MAX = '120';
}
