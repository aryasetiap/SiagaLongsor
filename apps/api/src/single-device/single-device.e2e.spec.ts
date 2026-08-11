import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { configureApp } from '../bootstrap/configure-app.js';
import { PrismaService } from '../database/prisma.service.js';
import { DeviceCredentialService } from '../devices/device-credential.service.js';
import { FirmwareRiskLevel, Role } from '../generated/prisma/enums.js';

describe('R2 single-device facade', () => {
  const run = randomUUID();
  const organizationId = `r2-org-${run}`;
  const siteId = `r2-site-${run}`;
  const pointId = `r2-point-${run}`;
  const userId = `r2-owner-${run}`;
  const email = `r2-owner-${run}@example.invalid`;
  const password = `R2-password-${run}`;
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let token: string;
  let hardwareId: string;
  let secret: string;
  let sequence = 0;

  beforeAll(async () => {
    env(`R2_${run}`.toUpperCase());
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.organization.create({
      data: { id: organizationId, name: 'R2 E2E', slug: `r2-${run}` },
    });
    await prisma.site.create({
      data: { id: siteId, organizationId, name: 'R2 Site', slug: `r2-site-${run}` },
    });
    await prisma.user.create({
      data: { id: userId, email, normalizedEmail: email, name: 'R2 Owner', passwordHash },
    });
    await prisma.membership.create({ data: { organizationId, userId, role: Role.PROJECT_OWNER } });
    const login = await http.post('/api/v1/auth/login').send({ email, password });
    token = login.body.accessToken as string;
  }, 30000);

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

  it('returns safe not-configured device and unavailable profile without a deployment', async () => {
    const [device, profile, overview, publicOverview, publicDevice, publicProfile, publicAudit] =
      await Promise.all([
        get('/device'),
        get('/risk-profile'),
        get('/overview'),
        publicGet('/overview'),
        publicGet('/device'),
        publicGet('/risk-profile'),
        publicGet('/audit-log'),
      ]);
    expect(device.status).toBe(200);
    expect(device.body.data).toMatchObject({
      configured: false,
      connectivity: 'UNKNOWN',
      sensors: { tilt: 'UNKNOWN', soilMoisture: 'UNKNOWN', rainfall: 'UNKNOWN' },
    });
    expect(profile.status).toBe(404);
    expect(profile.body.error.code).toBe('SINGLE_DEVICE_CONTEXT_UNAVAILABLE');
    expect(overview.body.data.risk.status).toBe('UNKNOWN');
    expect(publicOverview.status).toBe(200);
    expect(publicOverview.body.data).toMatchObject({
      configured: false,
      thresholds: null,
      risk: { status: 'UNKNOWN' },
    });
    expect([publicDevice.status, publicProfile.status, publicAudit.status]).toEqual([
      401, 401, 401,
    ]);
    expect(overview.body.data.range).toEqual(
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    );
  });

  it('resolves one device, preserves null readings, transitions risk, and pages typed audits', async () => {
    await createDeployment();
    expect((await get('/overview')).body.data.risk.status).toBe('UNKNOWN');
    await ingest({
      tiltMagnitudeDeg: 1,
      soilMoisturePct: 10,
      rainfallMmHour: 1,
      batteryVoltage: 1,
    });
    const safe = await get('/overview');
    expect(safe.body.data).toMatchObject({
      configured: true,
      risk: { status: 'SAFE' },
      readings: { tiltMagnitudeDeg: 1, soilMoisturePct: 10, rainfallMmHour: 1 },
      thresholds: {
        tiltMagnitudeDeg: { watch: 3, danger: 8 },
        soilMoisturePct: { watch: 50, danger: 80 },
        rainfallMmHour: { watch: 10, danger: 30 },
      },
    });
    expect((await publicGet('/overview')).body.data).toMatchObject({
      configured: true,
      risk: { status: 'SAFE' },
      readings: { tiltMagnitudeDeg: 1, soilMoisturePct: 10, rainfallMmHour: 1 },
    });
    expect((await get('/device')).body.data.sensors).toEqual({
      tilt: 'READABLE',
      soilMoisture: 'READABLE',
      rainfall: 'READABLE',
    });
    await ingest({
      tiltMagnitudeDeg: 3,
      soilMoisturePct: 10,
      rainfallMmHour: 1,
      batteryVoltage: 2,
    });
    await ingest({
      tiltMagnitudeDeg: 9,
      soilMoisturePct: 10,
      rainfallMmHour: 1,
      batteryVoltage: 3,
    });
    const audits = await get('/audit-log?limit=1');
    expect(audits.body.data[0]).toEqual(
      expect.objectContaining({
        previousStatus: 'WATCH',
        currentStatus: 'DANGER',
        sensorSnapshot: expect.objectContaining({ tiltMagnitudeDeg: 9 }),
      }),
    );
    expect(audits.body.page).toMatchObject({ hasMore: true, nextCursor: expect.any(String) });
    const next = await get(
      `/audit-log?limit=1&cursor=${encodeURIComponent(audits.body.page.nextCursor as string)}`,
    );
    expect(next.body.data[0].id).not.toBe(audits.body.data[0].id);
    await ingest({
      tiltMagnitudeDeg: null,
      soilMoisturePct: 10,
      rainfallMmHour: 1,
      batteryVoltage: 3,
    });
    const nullOverview = await get('/overview');
    expect(nullOverview.body.data).toMatchObject({
      risk: { status: 'UNKNOWN' },
      readings: { tiltMagnitudeDeg: null },
    });
    expect((await get('/device')).body.data.sensors.tilt).toBe('UNREADABLE');
  });

  it('rejects ambiguous enabled deployments instead of selecting one', async () => {
    const extra = await prisma.monitoringPoint.create({
      data: { organizationId, siteId, name: `extra-${run}` },
    });
    const issued = await app.get(DeviceCredentialService).issue();
    const extraDevice = await prisma.device.create({
      data: {
        organizationId,
        siteId,
        monitoringPointId: extra.id,
        hardwareId: `EXTRA_${run}`.toUpperCase(),
        displayName: 'extra',
        credentialHash: issued.hash,
        credentialRotatedAt: issued.issuedAt,
      },
    });
    try {
      const response = await get('/device');
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('SINGLE_DEVICE_CONTEXT_AMBIGUOUS');
    } finally {
      await prisma.device.delete({ where: { id: extraDevice.id } });
      await prisma.monitoringPoint.delete({ where: { id: extra.id } });
    }
  });

  it('maps, versions, validates, and atomically updates the simplified risk profile', async () => {
    const before = await get('/risk-profile');
    expect(before.status).toBe(200);
    expect(before.body.data).toMatchObject({
      version: expect.any(Number),
      calibrationStatus: 'PROVISIONAL',
      activatedAt: expect.any(String),
      notes: null,
      tiltMagnitudeDeg: { watch: expect.any(Number), danger: expect.any(Number) },
      soilMoisturePct: { watch: expect.any(Number), danger: expect.any(Number) },
      rainfallMmHour: { watch: expect.any(Number), danger: expect.any(Number) },
      rainfallDuration: {
        moderateDailyMinMm: 30,
        moderateDailyMaxMm: 50,
        consecutiveDays: 3,
        continuationRainfallMmHourGt: 0,
      },
    });
    const body = before.body.data as ProfileBody;
    const auditBefore = await prisma.auditLog.count({
      where: { organizationId, eventType: 'RISK_PROFILE_ACTIVATED' },
    });
    const identical = await put(profileRequest(body));
    expect(identical.body.data.changed).toBe(false);
    expect(
      await prisma.auditLog.count({
        where: { organizationId, eventType: 'RISK_PROFILE_ACTIVATED' },
      }),
    ).toBe(auditBefore);
    const changed = await put(profileRequest(body, { notes: 'changed' }));
    expect(changed.status).toBe(200);
    expect(changed.body.data.changed).toBe(true);
    const active = await prisma.riskProfile.findMany({ where: { siteId, isActive: true } });
    expect(active).toHaveLength(1);
    expect(active[0]?.version).toBe(body.version + 1);
    const cleared = await put(
      profileRequest(changed.body.data.profile as ProfileBody, { notes: null }),
    );
    expect(cleared.body.data.profile.notes).toBeNull();
    const invalids = await Promise.all([
      put({ soilMoisturePct: body.soilMoisturePct, rainfallMmHour: body.rainfallMmHour }),
      put(
        profileRequest(cleared.body.data.profile as ProfileBody, {
          tiltMagnitudeDeg: { watch: 8, danger: 8 },
        }),
      ),
      put(
        profileRequest(cleared.body.data.profile as ProfileBody, {
          soilMoisturePct: { watch: 0, danger: 101 },
        }),
      ),
      put(
        profileRequest(cleared.body.data.profile as ProfileBody, {
          rainfallDuration: {
            moderateDailyMinMm: 50,
            moderateDailyMaxMm: 30,
            consecutiveDays: 3,
            continuationRainfallMmHourGt: 0,
          },
        }),
      ),
    ]);
    expect(
      invalids.every(
        (response) => response.status === 400 && response.body.error.code === 'VALIDATION_ERROR',
      ),
    ).toBe(true);
    const current = cleared.body.data.profile as ProfileBody;
    const [first, second] = await Promise.all([
      put(profileRequest(current, { notes: 'concurrent-a' })),
      put(profileRequest(current, { notes: 'concurrent-b' })),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await prisma.riskProfile.count({ where: { siteId, isActive: true } })).toBe(1);
  });

  it('raises DANGER when rain continues after three consecutive moderate-rain days', async () => {
    const now = new Date();
    await ingest(
      { tiltMagnitudeDeg: 1, soilMoisturePct: 10, rainfallMmHour: 0, batteryVoltage: 3 },
      now.toISOString(),
    );
    const device = await prisma.device.findUniqueOrThrow({ where: { hardwareId } });
    const rows = [3, 2, 1].flatMap((daysAgo) => {
      const date = jakartaCalendarDate(now, daysAgo);
      return Array.from({ length: 61 }, (_, minute) => ({
        deviceId: device.id,
        monitoringPointId: pointId,
        messageId: `rain-${daysAgo}-${minute}-${run.slice(0, 8)}`,
        bootId: `rain-history-${run.slice(0, 8)}`,
        sequence: BigInt(daysAgo * 100 + minute),
        deviceTimestamp: new Date(
          `${date}T${minute === 60 ? '01:00' : `00:${String(minute).padStart(2, '0')}`}:00+07:00`,
        ),
        firmwareVersion: 'r2-history',
        tiltMagnitudeDeg: 1,
        soilMoisturePct: 10,
        rainfallMmHour: minute === 60 ? 0 : 40,
        batteryVoltage: 3,
        firmwareRiskLevel: FirmwareRiskLevel.UNKNOWN,
        firmwareSirenActive: false,
        canonicalPayloadHash: 'a'.repeat(64),
        rawPayload: {},
      }));
    });
    await prisma.telemetry.createMany({ data: rows });

    const response = await ingest(
      { tiltMagnitudeDeg: 1, soilMoisturePct: 10, rainfallMmHour: 0.1, batteryVoltage: 3 },
      new Date(now.getTime() + 1_000).toISOString(),
    );

    expect(response.status).toBe(201);
    const overview = await get('/overview');
    expect(overview.body.data.risk).toMatchObject({
      status: 'DANGER',
      reasons: expect.arrayContaining(['DANGER_PROLONGED_RAINFALL']),
    });
    const transition = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId, eventType: 'RISK_STATUS_CHANGED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(transition.metadata).toMatchObject({
      rainfallDuration: {
        consecutiveModerateDays: 3,
        previousDailyTotalsMm: [
          expect.closeTo(40, 5),
          expect.closeTo(40, 5),
          expect.closeTo(40, 5),
        ],
      },
    });
  });

  it('validates overview range, audit cursor, duplicate transitions, late data, battery, and stale projection', async () => {
    const now = new Date();
    const monthlyFrom = new Date(now.getTime() - 31 * 24 * 3_600_000);
    const monthly = await get(
      `/overview?from=${monthlyFrom.toISOString()}&to=${now.toISOString()}`,
    );
    expect(monthly.status).toBe(200);
    expect(monthly.body.data.range).toEqual({
      from: monthlyFrom.toISOString(),
      to: now.toISOString(),
    });
    const badRanges = await Promise.all([
      get(`/overview?from=${now.toISOString()}&to=${now.toISOString()}`),
      get(
        `/overview?from=${new Date(now.getTime() - (31 * 24 + 1) * 3_600_000).toISOString()}&to=${now.toISOString()}`,
      ),
    ]);
    expect(
      badRanges.every(
        (response) => response.status === 400 && response.body.error.code === 'VALIDATION_ERROR',
      ),
    ).toBe(true);
    await ingest({
      tiltMagnitudeDeg: 9,
      soilMoisturePct: 10,
      rainfallMmHour: 1,
      batteryVoltage: 30,
    });
    const beforeAudits = await prisma.auditLog.count({
      where: { organizationId, eventType: 'RISK_STATUS_CHANGED' },
    });
    const same = await ingest({
      tiltMagnitudeDeg: 9,
      soilMoisturePct: 10,
      rainfallMmHour: 1,
      batteryVoltage: 1,
    });
    expect(same.status).toBe(201);
    await http
      .post('/api/v1/iot/telemetry')
      .set('Authorization', `Device ${hardwareId}.${secret}`)
      .set('Idempotency-Key', same.body.telemetryId ? 'bad' : '')
      .send({});
    expect(
      await prisma.auditLog.count({ where: { organizationId, eventType: 'RISK_STATUS_CHANGED' } }),
    ).toBe(beforeAudits);
    const stateBefore = await prisma.currentMonitoringPointState.findUniqueOrThrow({
      where: { monitoringPointId: pointId },
    });
    const late = await ingest(
      { tiltMagnitudeDeg: 1, soilMoisturePct: 10, rainfallMmHour: 1, batteryVoltage: 0 },
      new Date(Date.now() - 86_400_000).toISOString(),
    );
    const lateAssessment = await prisma.riskAssessment.findUniqueOrThrow({
      where: { telemetryId: late.body.telemetryId as string },
    });
    expect(lateAssessment.affectsCurrentState).toBe(false);
    expect(
      (
        await prisma.currentMonitoringPointState.findUniqueOrThrow({
          where: { monitoringPointId: pointId },
        })
      ).latestTelemetryId,
    ).toBe(stateBefore.latestTelemetryId);
    expect((await get('/overview')).body.data.risk.status).toBe('DANGER');
    const invalidAudits = await Promise.all([
      get('/audit-log?cursor=tampered'),
      get('/audit-log?limit=1.5'),
      get('/audit-log?limit=0'),
      get('/audit-log?limit=101'),
    ]);
    expect(invalidAudits.map((response) => response.status)).toEqual([400, 400, 400, 400]);
    expect(invalidAudits[0].body.error.code).toBe('INVALID_CURSOR');
    await prisma.telemetry.update({
      where: { id: stateBefore.latestTelemetryId as string },
      data: { serverReceivedAt: new Date(Date.now() - 36 * 60_000) },
    });
    expect((await get('/overview')).body.data.risk.status).toBe('UNKNOWN');
    expect((await get('/device')).body.data.sensors.tilt).toBe('UNKNOWN');
  });

  it('returns risk profile unavailable and UNKNOWN overview when its active profile is absent', async () => {
    await prisma.riskProfile.updateMany({
      where: { siteId, isActive: true },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    const [profile, overview] = await Promise.all([get('/risk-profile'), get('/overview')]);
    expect(profile.status).toBe(404);
    expect(profile.body.error.code).toBe('RISK_PROFILE_UNAVAILABLE');
    expect(overview.body.data.risk.status).toBe('UNKNOWN');
  });

  async function createDeployment() {
    await prisma.monitoringPoint.create({
      data: { id: pointId, organizationId, siteId, name: 'R2 Point' },
    });
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
    secret = issued.raw;
    hardwareId = `R2_${run}`.toUpperCase();
    await prisma.device.create({
      data: {
        organizationId,
        siteId,
        monitoringPointId: pointId,
        hardwareId,
        displayName: 'R2 Device',
        credentialHash: issued.hash,
        credentialRotatedAt: issued.issuedAt,
      },
    });
  }
  function get(path: string): Promise<Response> {
    return http.get(`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
  }
  function publicGet(path: string): Promise<Response> {
    return http.get(`/api/v1${path}`);
  }
  function ingest(
    readings: Record<string, number | null>,
    timestamp = new Date().toISOString(),
  ): Promise<Response> {
    sequence += 1;
    const body = {
      messageId: `msg-${randomUUID()}`,
      bootId: `boot-${run}`,
      sequence,
      timestamp,
      firmwareVersion: 'r2',
      readings,
      deviceAssessment: { riskLevel: FirmwareRiskLevel.UNKNOWN, sirenActive: false },
    };
    return http
      .post('/api/v1/iot/telemetry')
      .set('Authorization', `Device ${hardwareId}.${secret}`)
      .set('Idempotency-Key', body.messageId)
      .send(body);
  }
  function put(body: Record<string, unknown>): Promise<Response> {
    return http.put('/api/v1/risk-profile').set('Authorization', `Bearer ${token}`).send(body);
  }
});
type ProfileBody = {
  version: number;
  calibrationStatus: string;
  notes: string | null;
  tiltMagnitudeDeg: { watch: number; danger: number };
  soilMoisturePct: { watch: number; danger: number };
  rainfallMmHour: { watch: number; danger: number };
  rainfallDuration: {
    moderateDailyMinMm: number;
    moderateDailyMaxMm: number;
    consecutiveDays: number;
    continuationRainfallMmHourGt: number;
  };
};
function profileRequest(
  profile: ProfileBody,
  overrides: Partial<Omit<ProfileBody, 'version' | 'calibrationStatus'>> = {},
) {
  return {
    tiltMagnitudeDeg: overrides.tiltMagnitudeDeg ?? profile.tiltMagnitudeDeg,
    soilMoisturePct: overrides.soilMoisturePct ?? profile.soilMoisturePct,
    rainfallMmHour: overrides.rainfallMmHour ?? profile.rainfallMmHour,
    rainfallDuration: overrides.rainfallDuration ?? profile.rainfallDuration,
    calibrationStatus: profile.calibrationStatus,
    ...(Object.prototype.hasOwnProperty.call(overrides, 'notes')
      ? { notes: overrides.notes }
      : { notes: profile.notes }),
  };
}
function jakartaCalendarDate(date: Date, daysAgo: number): string {
  const jakarta = new Date(date.getTime() + 7 * 60 * 60 * 1_000);
  return new Date(
    Date.UTC(jakarta.getUTCFullYear(), jakarta.getUTCMonth(), jakarta.getUTCDate() - daysAgo),
  )
    .toISOString()
    .slice(0, 10);
}
function env(publicDeviceHardwareId: string) {
  process.env.NODE_ENV = 'test';
  process.env.WEB_URL = 'http://localhost:3000';
  process.env.AUTH_ACCESS_TOKEN_SECRET = 'integration-only-access-secret-at-least-32-chars';
  process.env.AUTH_JWT_ISSUER = 'siagalongsor-api-test';
  process.env.AUTH_JWT_AUDIENCE = 'siagalongsor-web-test';
  process.env.AUTH_LOGIN_RATE_LIMIT_MAX = '100';
  process.env.AUTH_LOGIN_RATE_LIMIT_TTL_MS = '60000';
  process.env.TELEMETRY_MAX_FUTURE_SKEW_SECONDS = '300';
  process.env.TELEMETRY_RATE_LIMIT_MAX = '120';
  process.env.TELEMETRY_RATE_LIMIT_TTL_MS = '60000';
  process.env.PUBLIC_DEVICE_HARDWARE_ID = publicDeviceHardwareId;
}
