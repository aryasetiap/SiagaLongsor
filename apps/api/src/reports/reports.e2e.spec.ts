import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import argon2 from 'argon2';
import request, { type Test as SuperTestRequest } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { configureApp } from '../bootstrap/configure-app.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  AlertSeverity,
  AlertStatus,
  AlertType,
  DeviceLifecycleStatus,
  FirmwareRiskLevel,
  ReportJobStatus,
  ReportType,
  RiskLevel,
  Role,
} from '../generated/prisma/enums.js';
import {
  OBJECT_STORAGE,
  type ObjectStorageService,
  type PutObjectInput,
  type StoredObject,
} from '../object-storage/object-storage.js';

describe('Phase 06 reports API and worker', () => {
  const run = randomUUID();
  const organizationAId = `p6r-org-a-${run}`;
  const organizationBId = `p6r-org-b-${run}`;
  const siteAId = `p6r-site-a-${run}`;
  const siteBId = `p6r-site-b-${run}`;
  const pointAId = `p6r-point-a-${run}`;
  const pointBId = `p6r-point-b-${run}`;
  const ownerId = `p6r-owner-${run}`;
  const adminId = `p6r-admin-${run}`;
  const ownerEmail = `p6r-owner-${run}@example.invalid`;
  const adminEmail = `p6r-admin-${run}@example.invalid`;
  const password = `P6-reports-${randomUUID()}`;
  const storage = new TestObjectStorage();
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let ownerToken: string;
  let adminToken: string;
  let requestSequence = 0;

  beforeAll(async () => {
    setTestEnvironment();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OBJECT_STORAGE)
      .useValue(storage)
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    await createFixtures();
    ownerToken = await login(ownerEmail);
    adminToken = await login(adminEmail);
  }, 30_000);

  afterAll(async () => {
    if (prisma !== undefined) {
      await waitForWorkersIdle();
      await prisma.reportJob.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.auditLog.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.alertEvent.deleteMany({
        where: { alert: { organizationId: { in: [organizationAId, organizationBId] } } },
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
        where: { monitoringPointId: { in: [pointAId, pointBId] } },
      });
      await prisma.device.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.riskProfile.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.monitoringPoint.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.refreshSession.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
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
  }, 30_000);

  it('exports owner/admin CSV oldest-first with null, UNKNOWN, late semantics, and safe fields', async () => {
    const path = csvPath(siteAId);
    const [owner, admin] = await Promise.all([
      send(authenticated('get', path, ownerToken, organizationAId)),
      send(authenticated('get', path, adminToken, organizationAId)),
    ]);
    expect(owner.status).toBe(200);
    expect(admin.status).toBe(200);
    expect(owner.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(owner.headers['content-disposition']).toMatch(
      /^attachment; filename="[A-Za-z0-9_.-]+"$/,
    );
    const lines = owner.text.trimEnd().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('recordedAt,serverReceivedAt,monitoringPointName,hardwareId');
    expect(lines[1]).toContain("'=Formula Point,DEVICE-A");
    expect(lines[1]).toContain(',firmware-a,UNKNOWN,1,true');
    expect(lines[2]).toContain('DEVICE-B');
    expect(lines[2]).toMatch(/,firmware-b,,,$/);
    expect(lines[3]).toContain(',DANGER,1,false');
    expect(owner.text).not.toMatch(
      /rawPayload|credentialHash|password|authorization|canonicalPayloadHash/i,
    );
  });

  it('returns a header-only CSV for an empty persisted range', async () => {
    const response = await send(
      authenticated(
        'get',
        `/api/v1/reports/telemetry.csv?siteId=${siteAId}&from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z`,
        ownerToken,
        organizationAId,
      ),
    );
    expect(response.status).toBe(200);
    expect(response.text.trimEnd().split('\r\n')).toHaveLength(1);
  });

  it('hides cross-organization CSV resources and rejects a MonitoringPoint from another Site', async () => {
    const [site, point] = await Promise.all([
      send(authenticated('get', csvPath(siteBId), adminToken, organizationAId)),
      send(
        authenticated(
          'get',
          `${csvPath(siteAId)}&monitoringPointId=${pointBId}`,
          ownerToken,
          organizationAId,
        ),
      ),
    ]);
    expect(site.status).toBe(404);
    expect(site.body.error.code).toBe('SITE_NOT_FOUND');
    expect(point.status).toBe(404);
    expect(point.body.error.code).toBe('MONITORING_POINT_NOT_FOUND');
  });

  it('validates CSV and report ranges at the exact 31-day boundary', async () => {
    const overlong = await send(
      authenticated(
        'get',
        `/api/v1/reports/telemetry.csv?siteId=${siteAId}&from=2026-07-01T00%3A00%3A00.000Z&to=2026-08-01T00%3A00%3A00.001Z`,
        ownerToken,
        organizationAId,
      ),
    );
    expect(overlong.status).toBe(400);
    expect(overlong.body.error.code).toBe('INVALID_TIME_RANGE');
  });

  it('queues owner and admin reports durably with exactly one sanitized audit each', async () => {
    const [owner, admin] = await Promise.all([
      createJob(ownerToken, organizationAId, siteAId),
      createJob(adminToken, organizationAId, siteAId),
    ]);
    expect(owner.status).toBe(202);
    expect(admin.status).toBe(202);
    expect(owner.body.data.status).toBe('QUEUED');
    expect(admin.body.data.status).toBe('QUEUED');
    for (const response of [owner, admin]) {
      expect(response.body.data).not.toHaveProperty('objectKey');
      expect(
        await prisma.auditLog.count({
          where: { eventType: 'REPORT_JOB_CREATED', entityId: response.body.data.id as string },
        }),
      ).toBe(1);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { eventType: 'REPORT_JOB_CREATED', entityId: response.body.data.id as string },
      });
      expect(audit.metadata).toEqual({
        reportJobId: response.body.data.id,
        reportType: 'SITE_PERIOD_SUMMARY_PDF',
        siteId: siteAId,
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
      });
    }
  });

  it('worker produces a private PDF with consistent SHA/size and both roles download it', async () => {
    const created = await createJob(ownerToken, organizationAId, siteAId);
    const job = await waitForStatus(created.body.data.id as string, ReportJobStatus.SUCCEEDED);
    expect(job.artifactObjectKey).toMatch(/^reports\/[a-f0-9]{64}[.]pdf$/);
    expect(job.artifactSizeBytes).toBe(storage.objects.get(job.artifactObjectKey!)?.body.length);
    expect(storage.objects.get(job.artifactObjectKey!)?.body.subarray(0, 5).toString('ascii')).toBe(
      '%PDF-',
    );
    const [owner, admin] = await Promise.all([
      reportContent(ownerToken, organizationAId, job.id),
      reportContent(adminToken, organizationAId, job.id),
    ]);
    expect(owner.status).toBe(200);
    expect(admin.status).toBe(200);
    expect(owner.headers['content-type']).toMatch(/^application\/pdf/);
    expect(owner.headers['x-content-type-options']).toBe('nosniff');
    expect(owner.headers['content-disposition']).not.toMatch(/[\r\n]/);
  }, 20_000);

  it('retries one transient artifact failure and succeeds without duplicate success artifacts', async () => {
    storage.failPuts = 1;
    const created = await createJob(ownerToken, organizationAId, siteAId);
    const before = storage.putCount;
    const job = await waitForStatus(created.body.data.id as string, ReportJobStatus.SUCCEEDED);
    expect(storage.putCount - before).toBeGreaterThanOrEqual(2);
    expect([...storage.objects.keys()].filter((key) => key === job.artifactObjectKey)).toHaveLength(
      1,
    );
  }, 20_000);

  it('exhausts bounded retries into a sanitized FAILED job with no content', async () => {
    storage.alwaysFail = true;
    const created = await createJob(adminToken, organizationAId, siteAId);
    const job = await waitForStatus(created.body.data.id as string, ReportJobStatus.FAILED);
    storage.alwaysFail = false;
    expect(job.failureCode).toBe('REPORT_ARTIFACT_UNAVAILABLE');
    expect(job.failureMessage).not.toMatch(/simulated|provider|bucket|objectKey|redis|sql/i);
    expect(job.artifactObjectKey).toBeNull();
    const content = await reportContent(ownerToken, organizationAId, job.id);
    expect(content.status).toBe(409);
    expect(content.body.error.code).toBe('REPORT_NOT_READY');
  }, 20_000);

  it('lists organization jobs with filters, stable cursor, and no totalCount', async () => {
    const first = await send(
      authenticated(
        'get',
        `/api/v1/report-jobs?siteId=${siteAId}&reportType=SITE_PERIOD_SUMMARY_PDF&limit=1`,
        adminToken,
        organizationAId,
      ),
    );
    expect(first.status).toBe(200);
    expect(first.body).not.toHaveProperty('totalCount');
    expect(first.body.page.hasMore).toBe(true);
    const second = await send(
      authenticated(
        'get',
        `/api/v1/report-jobs?siteId=${siteAId}&reportType=SITE_PERIOD_SUMMARY_PDF&limit=1&cursor=${encodeURIComponent(first.body.page.nextCursor as string)}`,
        ownerToken,
        organizationAId,
      ),
    );
    expect(second.status).toBe(200);
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
    const rebound = await send(
      authenticated(
        'get',
        `/api/v1/report-jobs?status=FAILED&limit=1&cursor=${encodeURIComponent(first.body.page.nextCursor as string)}`,
        ownerToken,
        organizationAId,
      ),
    );
    expect(rebound.status).toBe(400);
    expect(rebound.body.error.code).toBe('INVALID_CURSOR');
  });

  it('hides cross-organization reports and never exposes queue/storage internals', async () => {
    const created = await createJob(ownerToken, organizationBId, siteBId);
    const cross = await send(
      authenticated(
        'get',
        `/api/v1/report-jobs/${created.body.data.id as string}`,
        ownerToken,
        organizationAId,
      ),
    );
    expect(cross.status).toBe(404);
    expect(cross.body.error.code).toBe('REPORT_JOB_NOT_FOUND');
    expect(JSON.stringify(created.body)).not.toMatch(
      /objectKey|bucket|endpoint|queueName|queueJobId|redis|bull/i,
    );
  });

  it('returns sanitized unavailable semantics when a successful private object is missing', async () => {
    const created = await createJob(ownerToken, organizationAId, siteAId);
    const job = await waitForStatus(created.body.data.id as string, ReportJobStatus.SUCCEEDED);
    storage.objects.delete(job.artifactObjectKey!);
    const response = await reportContent(ownerToken, organizationAId, job.id);
    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe('REPORT_ARTIFACT_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toMatch(/objectKey|bucket|endpoint|provider/i);
  }, 20_000);

  it('maps private storage provider failures to the same sanitized unavailable boundary', async () => {
    const created = await createJob(ownerToken, organizationAId, siteAId);
    const job = await waitForStatus(created.body.data.id as string, ReportJobStatus.SUCCEEDED);
    storage.failGets = 1;
    const response = await reportContent(adminToken, organizationAId, job.id);
    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe('REPORT_ARTIFACT_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toMatch(/provider|bucket|endpoint|objectKey/i);
  }, 20_000);

  it('expires content immediately while retaining durable metadata and regeneration uses a new id', async () => {
    const created = await createJob(ownerToken, organizationAId, siteAId);
    const job = await waitForStatus(created.body.data.id as string, ReportJobStatus.SUCCEEDED);
    await prisma.reportJob.update({
      where: { id: job.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const detail = await send(
      authenticated('get', `/api/v1/report-jobs/${job.id}`, adminToken, organizationAId),
    );
    expect(detail.body.data.status).toBe('EXPIRED');
    expect(detail.body.data.artifact).not.toBeNull();
    const content = await reportContent(adminToken, organizationAId, job.id);
    expect(content.status).toBe(410);
    expect(content.body.error.code).toBe('REPORT_ARTIFACT_UNAVAILABLE');
    const regenerated = await createJob(adminToken, organizationAId, siteAId);
    expect(regenerated.body.data.id).not.toBe(job.id);
    expect((await prisma.reportJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
      ReportJobStatus.EXPIRED,
    );
  }, 20_000);

  async function createFixtures(): Promise<void> {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'Reports Org A', slug: `p6r-a-${run}` },
        { id: organizationBId, name: 'Reports Org B', slug: `p6r-b-${run}` },
      ],
    });
    await prisma.site.createMany({
      data: [
        {
          id: siteAId,
          organizationId: organizationAId,
          name: 'Reports Site A',
          slug: `p6r-a-${run}`,
        },
        {
          id: siteBId,
          organizationId: organizationBId,
          name: 'Reports Site B',
          slug: `p6r-b-${run}`,
        },
      ],
    });
    await prisma.monitoringPoint.createMany({
      data: [
        { id: pointAId, organizationId: organizationAId, siteId: siteAId, name: '=Formula Point' },
        { id: pointBId, organizationId: organizationBId, siteId: siteBId, name: 'Other Point' },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          email: ownerEmail,
          normalizedEmail: ownerEmail,
          name: 'Reports Project Owner',
          passwordHash,
        },
        {
          id: adminId,
          email: adminEmail,
          normalizedEmail: adminEmail,
          name: 'Reports School Admin',
          passwordHash,
        },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { organizationId: organizationAId, userId: ownerId, role: Role.PROJECT_OWNER },
        { organizationId: organizationBId, userId: ownerId, role: Role.PROJECT_OWNER },
        { organizationId: organizationAId, userId: adminId, role: Role.SCHOOL_ADMIN },
      ],
    });
    await prisma.riskProfile.create({ data: riskProfileData() });
    await prisma.device.createMany({
      data: [
        {
          id: `p6r-device-a-${run}`,
          organizationId: organizationAId,
          siteId: siteAId,
          monitoringPointId: pointAId,
          hardwareId: `DEVICE-A-${run.toUpperCase()}`,
          displayName: 'Device A',
          credentialHash: 'not-a-secret',
          lifecycleStatus: DeviceLifecycleStatus.DISABLED,
          disabledAt: new Date('2026-07-02T12:00:00Z'),
        },
        {
          id: `p6r-device-b-${run}`,
          organizationId: organizationAId,
          siteId: siteAId,
          monitoringPointId: pointAId,
          hardwareId: `DEVICE-B-${run.toUpperCase()}`,
          displayName: 'Device B',
          credentialHash: 'not-a-secret',
        },
      ],
    });
    await prisma.telemetry.createMany({ data: telemetryRows() });
    await prisma.riskAssessment.createMany({
      data: [
        riskAssessmentData(
          `p6r-risk-a-${run}`,
          `p6r-telemetry-a-${run}`,
          `p6r-device-a-${run}`,
          RiskLevel.UNKNOWN,
          true,
          new Date('2026-07-02T00:00:02Z'),
        ),
        riskAssessmentData(
          `p6r-risk-c-${run}`,
          `p6r-telemetry-c-${run}`,
          `p6r-device-a-${run}`,
          RiskLevel.DANGER,
          false,
          new Date('2026-07-03T00:00:02Z'),
        ),
      ],
    });
    await prisma.alert.create({
      data: {
        id: `p6r-alert-${run}`,
        organizationId: organizationAId,
        siteId: siteAId,
        monitoringPointId: pointAId,
        type: AlertType.RISK_DANGER,
        severity: AlertSeverity.CRITICAL,
        status: AlertStatus.ACTIVE,
        deduplicationKey: `p6r-alert-${run}`,
        reasons: ['persisted danger'],
        firstObservedAt: new Date('2026-07-03T00:00:00Z'),
        lastObservedAt: new Date('2026-07-03T00:00:02Z'),
      },
    });
  }

  function riskProfileData() {
    return {
      id: `p6r-profile-${run}`,
      organizationId: organizationAId,
      siteId: siteAId,
      version: 1,
      calibrationStatus: 'PROVISIONAL' as const,
      safeTiltMagnitudeDegLt: '3',
      safeSoilMoisturePctLt: '65',
      safeRainfallMmHourLt: '20',
      dangerTiltMagnitudeDegGt: '8',
      dangerRainfallMmHourGt: '50',
      dangerSoilMoisturePctGt: '85',
      technicalTiltXDegMin: '-180',
      technicalTiltXDegMax: '180',
      technicalTiltYDegMin: '-180',
      technicalTiltYDegMax: '180',
      technicalTiltMagnitudeMin: '0',
      technicalTiltMagnitudeMax: '180',
      technicalSoilMoistureMin: '0',
      technicalSoilMoistureMax: '100',
      technicalRainfallMin: '0',
      technicalRainfallMax: '1000',
      technicalBatteryVoltageMin: '0',
      technicalBatteryVoltageMax: '30',
      technicalSignalRssiMin: '-150',
      technicalSignalRssiMax: '0',
      onlineWithinMinutes: 20,
      offlineAfterMinutes: 35,
      watchConsecutiveSamples: 2,
      dangerConsecutiveSamples: 1,
      downgradeStableMinutes: 10,
      mismatchConsecutiveSamples: 3,
    };
  }

  function telemetryRows() {
    const base = {
      monitoringPointId: pointAId,
      bootId: `p6r-boot-${run}`,
      tiltXDeg: '1',
      tiltYDeg: '1',
      tiltMagnitudeDeg: '1.4142',
      soilMoisturePct: '55',
      rainfallMmHour: '2',
      batteryVoltage: '12.4',
      firmwareRiskLevel: FirmwareRiskLevel.UNKNOWN,
      firmwareSirenActive: false,
      canonicalPayloadHash: 'a'.repeat(64),
      rawPayload: { secretNeverExport: true },
    };
    return [
      {
        ...base,
        id: `p6r-telemetry-a-${run}`,
        deviceId: `p6r-device-a-${run}`,
        messageId: `a-${run}`,
        sequence: 1n,
        deviceTimestamp: new Date('2026-07-02T00:00:00Z'),
        serverReceivedAt: new Date('2026-07-02T00:00:20Z'),
        firmwareVersion: 'firmware-a',
      },
      {
        ...base,
        id: `p6r-telemetry-b-${run}`,
        deviceId: `p6r-device-b-${run}`,
        messageId: `b-${run}`,
        sequence: 2n,
        deviceTimestamp: new Date('2026-07-02T00:00:00Z'),
        serverReceivedAt: new Date('2026-07-02T00:00:01Z'),
        firmwareVersion: 'firmware-b',
      },
      {
        ...base,
        id: `p6r-telemetry-c-${run}`,
        deviceId: `p6r-device-a-${run}`,
        messageId: `c-${run}`,
        sequence: 3n,
        deviceTimestamp: new Date('2026-07-03T00:00:00Z'),
        serverReceivedAt: new Date('2026-07-04T00:00:00Z'),
        firmwareVersion: 'firmware-c',
      },
    ];
  }

  function riskAssessmentData(
    id: string,
    telemetryId: string,
    deviceId: string,
    serverRisk: RiskLevel,
    affectsCurrentState: boolean,
    evaluatedAt: Date,
  ) {
    return {
      id,
      organizationId: organizationAId,
      siteId: siteAId,
      monitoringPointId: pointAId,
      deviceId,
      telemetryId,
      riskProfileId: `p6r-profile-${run}`,
      riskProfileVersion: 1,
      serverRisk,
      firmwareRisk: FirmwareRiskLevel.UNKNOWN,
      firmwareSirenActive: false,
      reasons: [serverRisk],
      affectsCurrentState,
      evaluatedAt,
    };
  }

  async function login(email: string): Promise<string> {
    const response = await send(
      http
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({ email, password }),
    );
    return response.body.accessToken as string;
  }

  function csvPath(siteId: string): string {
    return `/api/v1/reports/telemetry.csv?siteId=${siteId}&from=2026-07-01T00%3A00%3A00.000Z&to=2026-08-01T00%3A00%3A00.000Z`;
  }

  function createJob(token: string, organizationId: string, siteId: string) {
    return send(
      authenticated('post', '/api/v1/report-jobs', token, organizationId).send({
        reportType: ReportType.SITE_PERIOD_SUMMARY_PDF,
        siteId,
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
      }),
    );
  }

  function reportContent(token: string, organizationId: string, reportJobId: string) {
    return send(
      authenticated('get', `/api/v1/report-jobs/${reportJobId}/content`, token, organizationId),
    );
  }

  async function waitForStatus(reportJobId: string, expected: ReportJobStatus) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const job = await prisma.reportJob.findUniqueOrThrow({ where: { id: reportJobId } });
      if (job.status === expected) return job;
      if (job.status === ReportJobStatus.FAILED && expected !== ReportJobStatus.FAILED) {
        throw new Error(`Report unexpectedly failed: ${job.failureCode}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${expected}`);
  }

  async function waitForWorkersIdle(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const active = await prisma.reportJob.count({
        where: {
          organizationId: { in: [organizationAId, organizationBId] },
          status: { in: [ReportJobStatus.QUEUED, ReportJobStatus.PROCESSING] },
        },
      });
      if (active === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for report workers to become idle.');
  }

  function authenticated(
    method: 'get' | 'post',
    path: string,
    token: string,
    organizationId: string,
  ): SuperTestRequest {
    return http[method](path)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Organization-Id', organizationId);
  }

  function send(test: SuperTestRequest) {
    requestSequence += 1;
    return test.set('X-Request-Id', `p6r-${run}-${requestSequence}`);
  }
});

class TestObjectStorage implements ObjectStorageService {
  readonly objects = new Map<string, StoredObject>();
  failPuts = 0;
  failGets = 0;
  alwaysFail = false;
  putCount = 0;

  async put(input: PutObjectInput): Promise<void> {
    this.putCount += 1;
    if (this.alwaysFail || this.failPuts > 0) {
      this.failPuts = Math.max(0, this.failPuts - 1);
      throw new Error('simulated private storage failure');
    }
    this.objects.set(input.key, { body: Buffer.from(input.body), contentType: input.contentType });
  }

  async get(key: string): Promise<StoredObject | null> {
    if (this.failGets > 0) {
      this.failGets -= 1;
      throw new Error('simulated provider path and bucket detail');
    }
    return this.objects.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

function setTestEnvironment(): void {
  process.env.NODE_ENV = 'test';
  process.env.WEB_URL = 'http://localhost:3000';
  process.env.AUTH_ACCESS_TOKEN_SECRET ??=
    'phase-06-reports-test-secret-with-at-least-32-characters';
  process.env.AUTH_LOGIN_RATE_LIMIT_MAX = '100';
}
