import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request, { type Test as SuperTestRequest } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { configureApp } from '../bootstrap/configure-app.js';
import { PrismaService } from '../database/prisma.service.js';
import { Role } from '../generated/prisma/enums.js';

describe('Site risk profile API', () => {
  const runId = randomUUID();
  const organizationAId = `risk-profile-org-a-${runId}`;
  const organizationBId = `risk-profile-org-b-${runId}`;
  const siteAId = `risk-profile-site-a-${runId}`;
  const siteBId = `risk-profile-site-b-${runId}`;
  const ownerId = `risk-profile-owner-${runId}`;
  const adminId = `risk-profile-admin-${runId}`;
  const ownerEmail = `risk-profile-owner-${runId}@example.invalid`;
  const adminEmail = `risk-profile-admin-${runId}@example.invalid`;
  const password = `Risk-profile-password-${randomUUID()}`;
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let ownerToken: string;
  let adminToken: string;
  let sequence = 0;

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
        { id: organizationAId, name: 'Risk Profile A', slug: `risk-profile-a-${runId}` },
        { id: organizationBId, name: 'Risk Profile B', slug: `risk-profile-b-${runId}` },
      ],
    });
    await prisma.site.createMany({
      data: [
        {
          id: siteAId,
          organizationId: organizationAId,
          name: 'Site A',
          slug: `risk-profile-site-a-${runId}`,
        },
        {
          id: siteBId,
          organizationId: organizationBId,
          name: 'Site B',
          slug: `risk-profile-site-b-${runId}`,
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        userData(ownerId, ownerEmail, 'Risk Profile Owner', passwordHash),
        userData(adminId, adminEmail, 'Risk Profile Admin', passwordHash),
      ],
    });
    await prisma.membership.createMany({
      data: [
        { organizationId: organizationAId, userId: ownerId, role: Role.PROJECT_OWNER },
        { organizationId: organizationAId, userId: adminId, role: Role.SCHOOL_ADMIN },
      ],
    });
    await prisma.riskProfile.create({
      data: {
        ...profileData(1),
        organizationId: organizationAId,
        siteId: siteAId,
      },
    });
    ownerToken = await login(ownerEmail);
    adminToken = await login(adminEmail);
  }, 30_000);

  afterAll(async () => {
    if (prisma !== undefined) {
      await prisma.auditLog.deleteMany({ where: { organizationId: organizationAId } });
      await prisma.refreshSession.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
      await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, adminId] } } });
      await prisma.riskProfile.deleteMany({ where: { siteId: siteAId } });
      await prisma.site.deleteMany({ where: { id: { in: [siteAId, siteBId] } } });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationAId, organizationBId] } },
      });
    }
    await app?.close();
  });

  it('allows both roles to read the active profile', async () => {
    const [owner, admin] = await Promise.all([
      get(ownerToken, organizationAId, siteAId),
      get(adminToken, organizationAId, siteAId),
    ]);
    expect(owner.status).toBe(200);
    expect(admin.status).toBe(200);
    expect(owner.body.data.version).toBe(1);
    expect(admin.body).toEqual(owner.body);
  });

  it('rejects SCHOOL_ADMIN mutation and cross-organization site as 404', async () => {
    const [admin, crossOrganization] = await Promise.all([
      put(adminToken, organizationAId, siteAId, requestBody()),
      get(ownerToken, organizationAId, siteBId),
    ]);
    expect(admin.status).toBe(403);
    expect(admin.body.error.code).toBe('ROLE_ACCESS_DENIED');
    expect(crossOrganization.status).toBe(404);
    expect(crossOrganization.body.error.code).toBe('SITE_NOT_FOUND');
  });

  it('returns changed false for an identical canonical request', async () => {
    const response = await put(ownerToken, organizationAId, siteAId, requestBody());
    expect(response.status).toBe(200);
    expect(response.body.data.changed).toBe(false);
    expect(await prisma.riskProfile.count({ where: { siteId: siteAId } })).toBe(1);
  });

  it('creates an immutable next version for a changed request', async () => {
    const response = await put(ownerToken, organizationAId, siteAId, requestBody({ notes: 'v2' }));
    expect(response.status).toBe(200);
    expect(response.body.data.changed).toBe(true);
    expect(response.body.data.profile.version).toBe(2);
    const profiles = await prisma.riskProfile.findMany({
      where: { siteId: siteAId },
      orderBy: { version: 'asc' },
    });
    expect(profiles.map(({ version, isActive }) => ({ version, isActive }))).toEqual([
      { version: 1, isActive: false },
      { version: 2, isActive: true },
    ]);
  });

  it('serializes concurrent updates and leaves exactly one active version', async () => {
    const [first, second] = await Promise.all([
      put(ownerToken, organizationAId, siteAId, requestBody({ notes: 'concurrent-a' })),
      put(ownerToken, organizationAId, siteAId, requestBody({ notes: 'concurrent-b' })),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const profiles = await prisma.riskProfile.findMany({
      where: { siteId: siteAId },
      orderBy: { version: 'asc' },
    });
    expect(profiles.filter((profile) => profile.isActive)).toHaveLength(1);
    expect(profiles.map((profile) => profile.version)).toEqual([1, 2, 3, 4]);
  });

  it('rejects mutation of immutable historical configuration at database level', async () => {
    const historical = await prisma.riskProfile.findUniqueOrThrow({
      where: { siteId_version: { siteId: siteAId, version: 1 } },
    });
    await expect(
      prisma.riskProfile.update({
        where: { id: historical.id },
        data: { notes: 'mutation forbidden' },
      }),
    ).rejects.toThrow();
  });

  it('validates cross-field configuration', async () => {
    const body = requestBody();
    body.freshness.onlineWithinMinutes = 40;
    const response = await put(ownerToken, organizationAId, siteAId, body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  async function login(email: string): Promise<string> {
    const response = await send(http.post('/api/v1/auth/login').send({ email, password }));
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  function get(token: string, organizationId: string, siteId: string) {
    return send(
      http
        .get(`/api/v1/sites/${siteId}/risk-profile`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', organizationId),
    );
  }

  function put(
    token: string,
    organizationId: string,
    siteId: string,
    body: ReturnType<typeof requestBody>,
  ) {
    return send(
      http
        .put(`/api/v1/sites/${siteId}/risk-profile`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', organizationId)
        .send(body),
    );
  }

  function send(agent: SuperTestRequest) {
    sequence += 1;
    return agent.set('x-request-id', `risk-profile-${runId}-${sequence}`);
  }
});

function requestBody(overrides: { notes?: string | null } = {}) {
  return {
    calibrationStatus: 'PROVISIONAL',
    thresholds: {
      safe: { tiltMagnitudeDegLt: 3, soilMoisturePctLt: 65, rainfallMmHourLt: 20 },
      danger: { tiltMagnitudeDegGt: 8, rainfallMmHourGt: 50, soilMoisturePctGt: 85 },
    },
    technicalRanges: {
      tiltXDeg: { minimum: -180, maximum: 180 },
      tiltYDeg: { minimum: -180, maximum: 180 },
      tiltMagnitudeDeg: { minimum: 0, maximum: 180 },
      soilMoisturePct: { minimum: 0, maximum: 100 },
      rainfallMmHour: { minimum: 0, maximum: 1000 },
      batteryVoltage: { minimum: 0, maximum: 30 },
      signalRssi: { minimum: -150, maximum: 0 },
    },
    freshness: { onlineWithinMinutes: 20, offlineAfterMinutes: 35 },
    hysteresis: {
      watchConsecutiveSamples: 2,
      dangerConsecutiveSamples: 1,
      downgradeStableMinutes: 10,
      mismatchConsecutiveSamples: 3,
    },
    notes: overrides.notes ?? 'Profil provisional.',
  };
}

function profileData(version: number) {
  const body = requestBody();
  return {
    version,
    calibrationStatus: 'PROVISIONAL' as const,
    notes: body.notes,
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
  process.env.AUTH_ACCESS_TOKEN_SECRET = 'integration-only-access-secret-at-least-32-chars';
  process.env.AUTH_JWT_ISSUER = 'siagalongsor-api-test';
  process.env.AUTH_JWT_AUDIENCE = 'siagalongsor-web-test';
  process.env.AUTH_LOGIN_RATE_LIMIT_MAX = '100';
  process.env.AUTH_LOGIN_RATE_LIMIT_TTL_MS = '60000';
}

function userData(id: string, email: string, name: string, passwordHash: string) {
  return { id, email, normalizedEmail: email.toLowerCase(), name, passwordHash };
}
