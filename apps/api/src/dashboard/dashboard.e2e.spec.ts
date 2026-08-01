import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
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
import {
  AlertSeverity,
  AlertStatus,
  AlertType,
  ConnectivityStatus,
  DeviceLifecycleStatus,
  FirmwareRiskLevel,
  RiskLevel,
  Role,
} from '../generated/prisma/enums.js';

describe('Phase 04 dashboard data APIs', () => {
  const runId = randomUUID();
  const organizationAId = `p4-org-a-${runId}`;
  const organizationBId = `p4-org-b-${runId}`;
  const siteAId = `p4-site-a-${runId}`;
  const siteA2Id = `p4-site-a2-${runId}`;
  const siteBId = `p4-site-b-${runId}`;
  const safePointId = `p4-point-safe-${runId}`;
  const missingPointId = `p4-point-missing-${runId}`;
  const inactivePointId = `p4-point-inactive-${runId}`;
  const offlinePointId = `p4-point-offline-${runId}`;
  const dangerPointId = `p4-point-danger-${runId}`;
  const pointBId = `p4-point-b-${runId}`;
  const ownerId = `p4-owner-${runId}`;
  const adminId = `p4-admin-${runId}`;
  const ownerEmail = `p4-owner-${runId}@example.invalid`;
  const adminEmail = `p4-admin-${runId}@example.invalid`;
  const password = `P4-password-${randomUUID()}`;
  const observedAt = new Date();
  const seriesFrom = new Date(observedAt.getTime() - 6 * 60 * 60_000);
  const seriesTo = new Date(observedAt.getTime() - 60 * 60_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let ownerToken: string;
  let adminToken: string;
  let safeDeviceId: string;
  let mutableAlertId: string;
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
        { id: organizationAId, name: 'Phase 04 Organization A', slug: `p4-a-${runId}` },
        { id: organizationBId, name: 'Phase 04 Organization B', slug: `p4-b-${runId}` },
      ],
    });
    await prisma.site.createMany({
      data: [
        siteData(siteAId, organizationAId, 'Primary'),
        siteData(siteA2Id, organizationAId, 'Secondary'),
        siteData(siteBId, organizationBId, 'Other'),
      ],
    });
    await prisma.monitoringPoint.createMany({
      data: [
        pointData(safePointId, organizationAId, siteAId, true),
        pointData(missingPointId, organizationAId, siteAId, true),
        pointData(inactivePointId, organizationAId, siteAId, false),
        pointData(offlinePointId, organizationAId, siteAId, true),
        pointData(dangerPointId, organizationAId, siteA2Id, true),
        pointData(pointBId, organizationBId, siteBId, true),
      ],
    });
    await prisma.riskProfile.createMany({
      data: [
        {
          ...profileData(),
          id: profileId(siteAId),
          organizationId: organizationAId,
          siteId: siteAId,
        },
        {
          ...profileData(),
          id: profileId(siteA2Id),
          organizationId: organizationAId,
          siteId: siteA2Id,
        },
        {
          ...profileData(),
          id: profileId(siteBId),
          organizationId: organizationBId,
          siteId: siteBId,
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        userData(ownerId, ownerEmail, 'Phase 04 Owner', passwordHash),
        userData(adminId, adminEmail, 'Phase 04 Admin', passwordHash),
      ],
    });
    await prisma.membership.createMany({
      data: [
        { organizationId: organizationAId, userId: ownerId, role: Role.PROJECT_OWNER },
        { organizationId: organizationBId, userId: ownerId, role: Role.PROJECT_OWNER },
        { organizationId: organizationAId, userId: adminId, role: Role.SCHOOL_ADMIN },
      ],
    });

    safeDeviceId = await createDevice(safePointId, organizationAId, siteAId, 'safe');
    const historicalDeviceId = await createDevice(
      safePointId,
      organizationAId,
      siteAId,
      'historical',
      DeviceLifecycleStatus.DISABLED,
    );
    await createDevice(missingPointId, organizationAId, siteAId, 'missing');
    await createDevice(
      inactivePointId,
      organizationAId,
      siteAId,
      'inactive',
      DeviceLifecycleStatus.DISABLED,
    );
    const offlineDeviceId = await createDevice(offlinePointId, organizationAId, siteAId, 'offline');
    const dangerDeviceId = await createDevice(dangerPointId, organizationAId, siteA2Id, 'danger');
    const deviceBId = await createDevice(pointBId, organizationBId, siteBId, 'other');

    const historical = await createTelemetry(
      historicalDeviceId,
      safePointId,
      seriesFrom,
      'historical',
      true,
      organizationAId,
      siteAId,
    );
    const current = await createTelemetry(
      safeDeviceId,
      safePointId,
      new Date(observedAt.getTime() - 4 * 60 * 60_000),
      'current',
      true,
      organizationAId,
      siteAId,
    );
    const tieTime = new Date(observedAt.getTime() - 3 * 60 * 60_000);
    await createTelemetry(
      safeDeviceId,
      safePointId,
      tieTime,
      'tie-a',
      true,
      organizationAId,
      siteAId,
    );
    await createTelemetry(
      safeDeviceId,
      safePointId,
      tieTime,
      'tie-b',
      true,
      organizationAId,
      siteAId,
    );
    await createTelemetry(
      safeDeviceId,
      safePointId,
      new Date(observedAt.getTime() - 3.5 * 60 * 60_000),
      'late',
      false,
      organizationAId,
      siteAId,
    );
    await createTelemetry(
      safeDeviceId,
      safePointId,
      seriesTo,
      'exclusive-boundary',
      true,
      organizationAId,
      siteAId,
    );
    const offlineTelemetry = await createTelemetry(
      offlineDeviceId,
      offlinePointId,
      new Date(observedAt.getTime() - 2 * 60 * 60_000),
      'offline',
      true,
      organizationAId,
      siteAId,
    );
    const dangerTelemetry = await createTelemetry(
      dangerDeviceId,
      dangerPointId,
      new Date(observedAt.getTime() - 2 * 60 * 60_000),
      'danger',
      true,
      organizationAId,
      siteA2Id,
      RiskLevel.DANGER,
    );
    const telemetryB = await createTelemetry(
      deviceBId,
      pointBId,
      new Date(observedAt.getTime() - 2 * 60 * 60_000),
      'other',
      true,
      organizationBId,
      siteBId,
    );
    await Promise.all([
      createState(
        safePointId,
        organizationAId,
        siteAId,
        safeDeviceId,
        current.id,
        RiskLevel.SAFE,
        ConnectivityStatus.ONLINE,
      ),
      createState(
        offlinePointId,
        organizationAId,
        siteAId,
        offlineDeviceId,
        offlineTelemetry.id,
        RiskLevel.SAFE,
        ConnectivityStatus.OFFLINE,
      ),
      createState(
        dangerPointId,
        organizationAId,
        siteA2Id,
        dangerDeviceId,
        dangerTelemetry.id,
        RiskLevel.DANGER,
        ConnectivityStatus.ONLINE,
      ),
      createState(
        pointBId,
        organizationBId,
        siteBId,
        deviceBId,
        telemetryB.id,
        RiskLevel.SAFE,
        ConnectivityStatus.ONLINE,
      ),
    ]);
    mutableAlertId = await createAlert(
      organizationAId,
      siteAId,
      safePointId,
      AlertSeverity.CRITICAL,
      AlertStatus.ACTIVE,
      new Date(observedAt.getTime() - 60 * 60_000),
      'critical',
    );
    await createAlert(
      organizationAId,
      siteAId,
      missingPointId,
      AlertSeverity.WARNING,
      AlertStatus.ACKNOWLEDGED,
      new Date(observedAt.getTime() - 2 * 60 * 60_000),
      'acknowledged',
    );
    await createAlert(
      organizationAId,
      siteAId,
      safePointId,
      AlertSeverity.CRITICAL,
      AlertStatus.RESOLVED,
      new Date(observedAt.getTime() - 3 * 60 * 60_000),
      'resolved-new',
    );
    await createAlert(
      organizationAId,
      siteAId,
      safePointId,
      AlertSeverity.INFO,
      AlertStatus.ACTIVE,
      new Date(observedAt.getTime() - 30 * 60 * 60_000),
      'old',
    );
    await createAlert(
      organizationAId,
      siteA2Id,
      dangerPointId,
      AlertSeverity.CRITICAL,
      AlertStatus.ACTIVE,
      new Date(observedAt.getTime() - 30 * 60_000),
      'site-two',
    );
    await createAlert(
      organizationBId,
      siteBId,
      pointBId,
      AlertSeverity.CRITICAL,
      AlertStatus.ACTIVE,
      new Date(observedAt.getTime() - 30 * 60_000),
      'other-org',
    );

    ownerToken = await login(ownerEmail);
    adminToken = await login(adminEmail);
    expect(historical.id).toBeDefined();
  }, 45_000);

  afterAll(async () => {
    if (prisma !== undefined) {
      const organizations = [organizationAId, organizationBId];
      await prisma.alertEvent.deleteMany({
        where: { alert: { organizationId: { in: organizations } } },
      });
      await prisma.alert.deleteMany({ where: { organizationId: { in: organizations } } });
      await prisma.currentMonitoringPointState.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await prisma.riskAssessment.deleteMany({ where: { organizationId: { in: organizations } } });
      await prisma.telemetry.deleteMany({
        where: { device: { organizationId: { in: organizations } } },
      });
      await prisma.device.deleteMany({ where: { organizationId: { in: organizations } } });
      await prisma.riskProfile.deleteMany({ where: { organizationId: { in: organizations } } });
      await prisma.refreshSession.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
      await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, adminId] } } });
      await prisma.monitoringPoint.deleteMany({ where: { organizationId: { in: organizations } } });
      await prisma.site.deleteMany({ where: { organizationId: { in: organizations } } });
      await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
    }
    await app?.close();
  });

  it('allows both roles and requires organization context', async () => {
    const [owner, admin, missingHeader] = await Promise.all([
      getSummary(ownerToken, organizationAId),
      getSummary(adminToken, organizationAId),
      send(http.get('/api/v1/dashboard/summary').set('Authorization', `Bearer ${ownerToken}`)),
    ]);
    expect(owner.status).toBe(200);
    expect(admin.status).toBe(200);
    expect(missingHeader.status).toBe(400);
    expect(missingHeader.body.error.code).toBe('ORGANIZATION_CONTEXT_REQUIRED');
  });

  it('returns isolated, internally consistent summary aggregates', async () => {
    const response = await getSummary(ownerToken, organizationAId);
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.monitoringPoints).toEqual({ total: 5, active: 4, inactive: 1 });
    expect(sumBuckets(data.riskDistribution)).toBe(data.monitoringPoints.active);
    expect(data.riskDistribution).toEqual({ safe: 1, watch: 0, danger: 1, unknown: 2 });
    expect(data.devices).toEqual({ total: 6, enabled: 4, disabled: 2 });
    expect(sumBuckets(data.connectivityDistribution)).toBe(data.devices.enabled);
    expect(data.connectivityDistribution).toEqual({
      online: 2,
      delayed: 0,
      offline: 1,
      unknown: 1,
    });
    expect(data.alerts.active).toBe(4);
    expect(data.alerts.activeCritical).toBe(2);
    expect(data.alerts.activeCritical).toBeLessThanOrEqual(data.alerts.active);
    expect(data.alerts.newInWindow).toBe(4);
    expect(data.generatedAt).toBe(data.window.to);
    expect(new Date(data.window.to).getTime() - new Date(data.window.from).getTime()).toBe(
      24 * 60 * 60_000,
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /totalCount|credential|rawPayload|authorization|delta/i,
    );
  });

  it('applies one Site filter to every aggregate and hides cross-organization Sites', async () => {
    const [filtered, foreign] = await Promise.all([
      getSummary(ownerToken, organizationAId, `siteId=${encodeURIComponent(siteAId)}`),
      getSummary(ownerToken, organizationAId, `siteId=${encodeURIComponent(siteBId)}`),
    ]);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.monitoringPoints).toEqual({ total: 4, active: 3, inactive: 1 });
    expect(filtered.body.data.devices).toEqual({ total: 5, enabled: 3, disabled: 2 });
    expect(filtered.body.data.alerts).toEqual({ active: 3, activeCritical: 1, newInWindow: 3 });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('SITE_NOT_FOUND');
  });

  it('validates windowHours and uses firstObservedAt instead of repeated observations', async () => {
    await prisma.alert.update({
      where: { id: mutableAlertId },
      data: { occurrenceCount: 99, lastObservedAt: new Date() },
    });
    const [oneHour, below, above] = await Promise.all([
      getSummary(ownerToken, organizationAId, 'windowHours=1'),
      getSummary(ownerToken, organizationAId, 'windowHours=0'),
      getSummary(ownerToken, organizationAId, 'windowHours=169'),
    ]);
    expect(oneHour.status).toBe(200);
    expect(oneHour.body.data.alerts.newInWindow).toBe(1);
    expect(below.body.error.code).toBe('VALIDATION_ERROR');
    expect(above.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('keeps summary invariants during canonical Device -> State -> Alert writes', async () => {
    const reads = Array.from({ length: 8 }, () => getSummary(ownerToken, organizationAId));
    const writer = prisma.$transaction(async (transaction) => {
      await transaction.device.update({
        where: { id: safeDeviceId },
        data: { updatedAt: new Date() },
      });
      await transaction.currentMonitoringPointState.update({
        where: { monitoringPointId: safePointId },
        data: { evaluatedAt: new Date() },
      });
      await transaction.alert.update({
        where: { id: mutableAlertId },
        data: { updatedAt: new Date() },
      });
    });
    const results = await Promise.all([...reads, writer]);
    for (const response of results.slice(0, -1) as SuperTestResponse[]) {
      expect(response.status).toBe(200);
      expect(sumBuckets(response.body.data.riskDistribution)).toBe(
        response.body.data.monitoringPoints.active,
      );
      expect(sumBuckets(response.body.data.connectivityDistribution)).toBe(
        response.body.data.devices.enabled,
      );
    }
  });

  it('serves oldest-first sensor history across historical Devices and excludes late data by default', async () => {
    const response = await getSeries(ownerToken, organizationAId, safePointId, rangeQuery());
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(4);
    expect(response.body.data.items.every((item: { isLate: boolean }) => !item.isLate)).toBe(true);
    expect(response.body.data.items[0].deviceId).not.toBe(safeDeviceId);
    expect(response.body.data.items.map((item: { recordedAt: string }) => item.recordedAt)).toEqual(
      [...response.body.data.items.map((item: { recordedAt: string }) => item.recordedAt)].sort(),
    );
    expect(response.body.data).not.toHaveProperty('totalCount');
    expect(JSON.stringify(response.body)).not.toMatch(/rawPayload|credential|authorization/i);
  });

  it('uses inclusive from, exclusive to, preserves gaps, and includes marked late data on request', async () => {
    const response = await getSeries(
      ownerToken,
      organizationAId,
      safePointId,
      `${rangeQuery()}&includeLate=true`,
    );
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(5);
    expect(
      response.body.data.items.filter((item: { isLate: boolean }) => item.isLate),
    ).toHaveLength(1);
    expect(
      response.body.data.items.some(
        (item: { recordedAt: string }) => item.recordedAt === seriesFrom.toISOString(),
      ),
    ).toBe(true);
    expect(
      response.body.data.items.some(
        (item: { recordedAt: string }) => item.recordedAt === seriesTo.toISOString(),
      ),
    ).toBe(false);
  });

  it('paginates equal timestamps without duplicate or skip', async () => {
    const query = `${rangeQuery()}&includeLate=true&limit=2`;
    const first = await getSeries(ownerToken, organizationAId, safePointId, query);
    const second = await getSeries(
      ownerToken,
      organizationAId,
      safePointId,
      `${query}&cursor=${encodeURIComponent(first.body.data.nextCursor as string)}`,
    );
    const third = await getSeries(
      ownerToken,
      organizationAId,
      safePointId,
      `${query}&cursor=${encodeURIComponent(second.body.data.nextCursor as string)}`,
    );
    const ids = [...first.body.data.items, ...second.body.data.items, ...third.body.data.items].map(
      (item: { telemetryId: string }) => item.telemetryId,
    );
    expect(first.body.data.hasMore).toBe(true);
    expect(second.body.data.hasMore).toBe(true);
    expect(third.body.data.hasMore).toBe(false);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    const tied = [...first.body.data.items, ...second.body.data.items, ...third.body.data.items]
      .filter(
        (item: { recordedAt: string }) =>
          item.recordedAt === new Date(observedAt.getTime() - 3 * 60 * 60_000).toISOString(),
      )
      .map((item: { telemetryId: string }) => item.telemetryId);
    expect(tied).toEqual([...tied].sort());
  });

  it('rejects cursor context reuse across organization, point, range, and includeLate', async () => {
    const query = `${rangeQuery()}&limit=1`;
    const first = await getSeries(ownerToken, organizationAId, safePointId, query);
    const cursor = encodeURIComponent(first.body.data.nextCursor as string);
    const [organization, point, range, late] = await Promise.all([
      getSeries(ownerToken, organizationBId, pointBId, `${rangeQuery()}&limit=1&cursor=${cursor}`),
      getSeries(
        ownerToken,
        organizationAId,
        missingPointId,
        `${rangeQuery()}&limit=1&cursor=${cursor}`,
      ),
      getSeries(
        ownerToken,
        organizationAId,
        safePointId,
        `${differentRangeQuery()}&limit=1&cursor=${cursor}`,
      ),
      getSeries(
        ownerToken,
        organizationAId,
        safePointId,
        `${query}&includeLate=true&cursor=${cursor}`,
      ),
    ]);
    for (const response of [organization, point, range, late]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_CURSOR');
    }
  });

  it('enforces organization isolation, both roles, range validity, and maximum limit', async () => {
    const [admin, foreign, tooLong, reversed, tooLarge] = await Promise.all([
      getSeries(adminToken, organizationAId, safePointId, rangeQuery()),
      getSeries(ownerToken, organizationAId, pointBId, rangeQuery()),
      getSeries(ownerToken, organizationAId, safePointId, overlongRangeQuery()),
      getSeries(ownerToken, organizationAId, safePointId, reversedRangeQuery()),
      getSeries(ownerToken, organizationAId, safePointId, `${rangeQuery()}&limit=1001`),
    ]);
    expect(admin.status).toBe(200);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('MONITORING_POINT_NOT_FOUND');
    for (const response of [tooLong, reversed, tooLarge]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  async function login(email: string): Promise<string> {
    const response = await send(http.post('/api/v1/auth/login').send({ email, password }));
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  function getSummary(token: string, organizationId: string, query = '') {
    return get(
      `/api/v1/dashboard/summary${query === '' ? '' : `?${query}`}`,
      token,
      organizationId,
    );
  }

  function getSeries(token: string, organizationId: string, pointId: string, query = '') {
    return get(
      `/api/v1/monitoring-points/${pointId}/sensor-series${query === '' ? '' : `?${query}`}`,
      token,
      organizationId,
    );
  }

  function get(path: string, token: string, organizationId: string) {
    return send(
      http
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', organizationId),
    );
  }

  function send(agent: SuperTestRequest): Promise<SuperTestResponse> {
    requestSequence += 1;
    return agent.set('x-request-id', `phase04-${runId}-${requestSequence}`);
  }

  function rangeQuery(): string {
    return `from=${encodeURIComponent(seriesFrom.toISOString())}&to=${encodeURIComponent(seriesTo.toISOString())}`;
  }

  function differentRangeQuery(): string {
    return `from=${encodeURIComponent(new Date(seriesFrom.getTime() + 60_000).toISOString())}&to=${encodeURIComponent(seriesTo.toISOString())}`;
  }

  function overlongRangeQuery(): string {
    const from = new Date(seriesTo.getTime() - 169 * 60 * 60_000);
    return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(seriesTo.toISOString())}`;
  }

  function reversedRangeQuery(): string {
    return `from=${encodeURIComponent(seriesTo.toISOString())}&to=${encodeURIComponent(seriesFrom.toISOString())}`;
  }

  async function createDevice(
    monitoringPointId: string,
    organizationId: string,
    siteId: string,
    suffix: string,
    lifecycleStatus: DeviceLifecycleStatus = DeviceLifecycleStatus.ENABLED,
  ): Promise<string> {
    const row = await prisma.device.create({
      data: {
        organizationId,
        siteId,
        monitoringPointId,
        hardwareId: `P4_${suffix}_${runId}`.toUpperCase(),
        displayName: `Phase 04 Device ${suffix}`,
        credentialHash: `integration-hash-${suffix}-${runId}`,
        lifecycleStatus,
        ...(lifecycleStatus === DeviceLifecycleStatus.DISABLED ? { disabledAt: observedAt } : {}),
      },
    });
    return row.id;
  }

  async function createTelemetry(
    deviceId: string,
    monitoringPointId: string,
    recordedAt: Date,
    suffix: string,
    affectsCurrentState: boolean,
    organizationId: string,
    siteId: string,
    serverRisk: RiskLevel = RiskLevel.SAFE,
  ) {
    const telemetry = await prisma.telemetry.create({
      data: {
        id: `p4-telemetry-${suffix}-${runId}`,
        deviceId,
        monitoringPointId,
        messageId: randomUUID(),
        bootId: randomUUID(),
        sequence: 1,
        deviceTimestamp: recordedAt,
        serverReceivedAt: affectsCurrentState ? new Date(recordedAt.getTime() + 1_000) : observedAt,
        firmwareVersion: '4.0.0',
        tiltMagnitudeDeg: serverRisk === RiskLevel.DANGER ? 9 : 2,
        soilMoisturePct: 60,
        rainfallMmHour: 5,
        batteryVoltage: 12,
        firmwareRiskLevel: FirmwareRiskLevel.SAFE,
        firmwareSirenActive: false,
        canonicalPayloadHash: suffix.padEnd(64, '0').slice(0, 64),
        rawPayload: { fixture: suffix },
      },
    });
    await prisma.riskAssessment.create({
      data: {
        organizationId,
        siteId,
        monitoringPointId,
        deviceId,
        telemetryId: telemetry.id,
        riskProfileId: profileId(siteId),
        riskProfileVersion: 1,
        serverRisk,
        firmwareRisk: FirmwareRiskLevel.SAFE,
        firmwareSirenActive: false,
        reasons: serverRisk === RiskLevel.DANGER ? ['DANGER_TILT'] : ['SAFE_THRESHOLDS_MET'],
        affectsCurrentState,
        evaluatedAt: telemetry.serverReceivedAt,
      },
    });
    return telemetry;
  }

  function createState(
    monitoringPointId: string,
    organizationId: string,
    siteId: string,
    deviceId: string,
    telemetryId: string,
    serverRisk: RiskLevel,
    connectivityStatus: ConnectivityStatus,
  ) {
    return prisma.currentMonitoringPointState.create({
      data: {
        monitoringPointId,
        organizationId,
        siteId,
        deviceId,
        serverRisk,
        connectivityStatus,
        reasons: ['TEST_PROJECTION'],
        latestTelemetryId: telemetryId,
        evaluatedAt: observedAt,
        lastTelemetryAt: observedAt,
        riskProfileId: profileId(siteId),
        riskProfileVersion: 1,
      },
    });
  }

  async function createAlert(
    organizationId: string,
    siteId: string,
    monitoringPointId: string,
    severity: AlertSeverity,
    status: AlertStatus,
    firstObservedAt: Date,
    suffix: string,
  ): Promise<string> {
    const alert = await prisma.alert.create({
      data: {
        organizationId,
        siteId,
        monitoringPointId,
        type: severity === AlertSeverity.CRITICAL ? AlertType.RISK_DANGER : AlertType.RISK_WATCH,
        severity,
        status,
        deduplicationKey: `p4:${suffix}:${runId}`,
        reasons: ['TEST_ALERT'],
        firstObservedAt,
        lastObservedAt: observedAt,
        occurrenceCount: suffix === 'critical' ? 5 : 1,
      },
    });
    return alert.id;
  }
});

function sumBuckets(value: Record<string, number>): number {
  return Object.values(value).reduce((sum, count) => sum + count, 0);
}

function siteData(id: string, organizationId: string, suffix: string) {
  return {
    id,
    organizationId,
    name: `Phase 04 Site ${suffix}`,
    slug: `p4-${suffix.toLowerCase()}-${id.slice(-8)}`,
  };
}

function pointData(id: string, organizationId: string, siteId: string, isActive: boolean) {
  return { id, organizationId, siteId, name: `Phase 04 Point ${id.slice(-8)}`, isActive };
}

function profileId(siteId: string): string {
  return `profile-${siteId}`;
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
}
