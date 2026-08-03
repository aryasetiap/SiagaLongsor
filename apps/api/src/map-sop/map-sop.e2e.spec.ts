import { createHash, randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import argon2 from 'argon2';
import request, { type Test as SuperTestRequest } from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../app.module.js';
import { configureApp } from '../bootstrap/configure-app.js';
import { PrismaService } from '../database/prisma.service.js';
import { Role } from '../generated/prisma/enums.js';
import {
  OBJECT_STORAGE,
  type ObjectStorageService,
  type PutObjectInput,
  type StoredObject,
} from '../object-storage/object-storage.js';
import { MAX_SOP_BYTES } from './sop-file.validation.js';

describe('Phase 06 Map Configuration and SOP API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  const storage = new TestObjectStorage();
  const run = randomUUID();
  const organizationAId = `p6-org-a-${run}`;
  const organizationBId = `p6-org-b-${run}`;
  const siteAId = `p6-site-a-${run}`;
  const siteBId = `p6-site-b-${run}`;
  const siteUnconfiguredId = `p6-site-empty-${run}`;
  const pointAId = `p6-point-a-${run}`;
  const pointBId = `p6-point-b-${run}`;
  const ownerId = `p6-owner-${run}`;
  const adminId = `p6-admin-${run}`;
  const ownerEmail = `p6-owner-${run}@example.invalid`;
  const adminEmail = `p6-admin-${run}@example.invalid`;
  const password = `P6-password-${randomUUID()}`;
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
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'P6 Organization A', slug: `p6-a-${run}` },
        { id: organizationBId, name: 'P6 Organization B', slug: `p6-b-${run}` },
      ],
    });
    await prisma.site.createMany({
      data: [
        { id: siteAId, organizationId: organizationAId, name: 'P6 Site A', slug: `p6-a-${run}` },
        {
          id: siteUnconfiguredId,
          organizationId: organizationAId,
          name: 'P6 Empty',
          slug: `p6-empty-${run}`,
        },
        { id: siteBId, organizationId: organizationBId, name: 'P6 Site B', slug: `p6-b-${run}` },
      ],
    });
    await prisma.monitoringPoint.createMany({
      data: [
        { id: pointAId, organizationId: organizationAId, siteId: siteAId, name: 'P6 Point A' },
        { id: pointBId, organizationId: organizationBId, siteId: siteBId, name: 'P6 Point B' },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          email: ownerEmail,
          normalizedEmail: ownerEmail,
          name: 'P6 Owner',
          passwordHash,
        },
        {
          id: adminId,
          email: adminEmail,
          normalizedEmail: adminEmail,
          name: 'P6 Admin',
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
    ownerToken = await login(ownerEmail);
    adminToken = await login(adminEmail);
  }, 30_000);

  afterAll(async () => {
    if (prisma !== undefined) {
      await prisma.activeSiteSopDocument.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.activeSiteMapConfiguration.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.sopDocumentVersion.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.siteMapConfiguration.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.auditLog.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.refreshSession.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
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

  it('enforces map role and organization isolation', async () => {
    const [adminPut, crossOrganization] = await Promise.all([
      sendMap(adminToken, organizationAId, siteAId, mapPayload(null)),
      getMap(ownerToken, organizationAId, siteBId),
    ]);
    expect(adminPut.status).toBe(403);
    expect(crossOrganization.status).toBe(404);
    expect(crossOrganization.body.error.code).toBe('SITE_NOT_FOUND');
  });

  it('creates, reads, no-ops, versions, audits, and rejects stale map updates', async () => {
    const created = await sendMap(ownerToken, organizationAId, siteAId, mapPayload(null));
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ changed: true, data: { version: 1 } });

    const adminRead = await getMap(adminToken, organizationAId, siteAId);
    expect(adminRead.status).toBe(200);
    expect(adminRead.body.data).not.toHaveProperty('canonicalHash');

    const auditBefore = await mapAuditCount();
    const noOp = await sendMap(ownerToken, organizationAId, siteAId, mapPayload(1));
    expect(noOp.body).toMatchObject({ changed: false, data: { version: 1 } });
    expect(await mapAuditCount()).toBe(auditBefore);

    const stale = await sendMap(ownerToken, organizationAId, siteAId, mapPayload(null));
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('MAP_CONFIG_VERSION_CONFLICT');

    const updated = await sendMap(ownerToken, organizationAId, siteAId, mapPayload(1, 'v2'));
    expect(updated.body).toMatchObject({ changed: true, data: { version: 2, notes: 'v2' } });
    const versions = await prisma.siteMapConfiguration.findMany({
      where: { siteId: siteAId },
      orderBy: { version: 'asc' },
    });
    expect(versions.map((row) => row.version)).toEqual([1, 2]);
    expect(versions[0]?.configuration).toMatchObject({ notes: null });
    expect(await mapAuditCount()).toBe(auditBefore + 1);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { eventType: 'MAP_CONFIG_VERSION_CREATED', entityId: updated.body.data.id as string },
    });
    expect(audit.metadata).toEqual({
      siteId: siteAId,
      previousVersion: 1,
      newVersion: 2,
      monitoringPointCount: 1,
      riskZoneCount: 0,
      routeCount: 0,
    });
  });

  it('rejects duplicate and cross-Site MonitoringPoint locations', async () => {
    const active = await getMap(ownerToken, organizationAId, siteAId);
    const version = active.body.data.version as number;
    const duplicate = mapPayload(version);
    duplicate.monitoringPointLocations.push({ ...duplicate.monitoringPointLocations[0]! });
    const [duplicateResponse, crossSiteResponse] = await Promise.all([
      sendMap(ownerToken, organizationAId, siteAId, duplicate),
      sendMap(ownerToken, organizationAId, siteAId, {
        ...mapPayload(version),
        monitoringPointLocations: [{ monitoringPointId: pointBId, position: [105, -5] }],
      }),
    ]);
    expect(duplicateResponse.status).toBe(400);
    expect(crossSiteResponse.status).toBe(404);
    expect(crossSiteResponse.body.error.code).toBe('MONITORING_POINT_NOT_FOUND');
  });

  it('serializes 20 concurrent map updates without duplicate versions or HTTP 500', async () => {
    const active = await getMap(ownerToken, organizationAId, siteAId);
    const version = active.body.data.version as number;
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        sendMap(ownerToken, organizationAId, siteAId, mapPayload(version, `parallel-${index}`)),
      ),
    );
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(19);
    expect(responses.every((response) => response.status !== 500)).toBe(true);
    const duplicates = await prisma.$queryRaw<Array<{ version: number }>>`
      SELECT "version" FROM "SiteMapConfiguration" WHERE "siteId" = ${siteAId}
      GROUP BY "version" HAVING COUNT(*) > 1
    `;
    expect(duplicates).toEqual([]);
  });

  it('returns configured and honest unconfigured map overviews without sensitive fields', async () => {
    const markerQuery = vi.spyOn(prisma.monitoringPoint, 'findMany');
    const [configured, unconfigured] = await Promise.all([
      overview(adminToken, organizationAId, siteAId),
      overview(adminToken, organizationAId, siteUnconfiguredId),
    ]);
    expect(configured.status).toBe(200);
    expect(configured.body.data.configuration.configured).toBe(true);
    expect(configured.body.data.markers).toHaveLength(1);
    expect(configured.body.data.markers[0].currentState).toBeNull();
    expect(JSON.stringify(configured.body)).not.toMatch(/credential|rawPayload|objectKey/i);
    expect(unconfigured.body.data).toMatchObject({
      configuration: {
        configured: false,
        version: null,
        center: null,
        riskZones: [],
        evacuationRoutes: [],
      },
      markers: [],
    });
    expect(unconfigured.body).not.toHaveProperty('totalCount');
    expect(markerQuery).toHaveBeenCalledTimes(1);
    markerQuery.mockRestore();
  });

  it('validates upload authorization, MIME, extension, signature, and empty input', async () => {
    const [adminUpload, invalidMime, invalidExtension, spoofed, empty, tooLarge] =
      await Promise.all([
        upload(adminToken, organizationAId, siteAId, pdfBytes(), 'sop.pdf'),
        upload(ownerToken, organizationAId, siteAId, pdfBytes(), 'sop.pdf', 'text/plain'),
        upload(ownerToken, organizationAId, siteAId, pdfBytes(), 'sop.txt'),
        upload(ownerToken, organizationAId, siteAId, Buffer.from('not-pdf'), 'sop.pdf'),
        upload(ownerToken, organizationAId, siteAId, Buffer.alloc(0), 'sop.pdf'),
        upload(
          ownerToken,
          organizationAId,
          siteAId,
          Buffer.alloc(MAX_SOP_BYTES + 1),
          'too-large.pdf',
        ),
      ]);
    expect(adminUpload.status).toBe(403);
    expect(invalidMime.status).toBe(415);
    expect(invalidExtension.status).toBe(400);
    expect(spoofed.status).toBe(400);
    expect(empty.status).toBe(400);
    expect(tooLarge.status).toBe(413);
  });

  it('uploads, reads, lists, and downloads immutable SOP versions for both roles', async () => {
    const first = await upload(
      ownerToken,
      organizationAId,
      siteAId,
      pdfBytes('one'),
      '../SOP one.pdf',
    );
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      version: 1,
      isActive: true,
      mediaType: 'application/pdf',
    });
    expect(first.body.data).not.toHaveProperty('objectKey');

    const [adminRead, ownerList, content] = await Promise.all([
      activeSop(adminToken, organizationAId, siteAId),
      listSop(ownerToken, organizationAId, siteAId),
      sopContent(adminToken, organizationAId, first.body.data.id as string),
    ]);
    expect(adminRead.status).toBe(200);
    expect(ownerList.body).not.toHaveProperty('totalCount');
    expect(content.status).toBe(200);
    expect(content.headers['content-type']).toMatch(/^application\/pdf/);
    expect(content.headers['x-content-type-options']).toBe('nosniff');
    expect(content.headers['content-disposition']).not.toMatch(/[\r\n]/);

    const second = await upload(
      ownerToken,
      organizationAId,
      siteAId,
      pdfBytes('two'),
      'SOP two.pdf',
    );
    expect(second.body.data.version).toBe(2);
    const versions = await listSop(adminToken, organizationAId, siteAId);
    expect(versions.body.data.map((item: { version: number }) => item.version)).toEqual([2, 1]);
    expect(versions.body.data.map((item: { isActive: boolean }) => item.isActive)).toEqual([
      true,
      false,
    ]);
    const immutableFirst = await prisma.sopDocumentVersion.findUniqueOrThrow({
      where: { id: first.body.data.id as string },
    });
    expect(immutableFirst).toMatchObject({ version: 1, title: 'SOP Resmi' });
  });

  it('hides cross-organization SOP metadata and content', async () => {
    const active = await activeSop(ownerToken, organizationAId, siteAId);
    const [crossSite, crossDocument] = await Promise.all([
      activeSop(ownerToken, organizationAId, siteBId),
      sopContent(ownerToken, organizationBId, active.body.data.id as string),
    ]);
    expect(crossSite.status).toBe(404);
    expect(crossDocument.status).toBe(404);
  });

  it('serializes 20 concurrent SOP uploads with unique monotonic versions and no HTTP 500', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        upload(
          ownerToken,
          organizationAId,
          siteAId,
          pdfBytes(`parallel-${index}`),
          `parallel-${index}.pdf`,
        ),
      ),
    );
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    const responses = results.map((result) => {
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    });
    expect(responses.every((response) => response.status === 201)).toBe(true);
    const rows = await prisma.sopDocumentVersion.findMany({
      where: { siteId: siteAId },
      orderBy: { version: 'asc' },
    });
    expect(new Set(rows.map((row) => row.version)).size).toBe(rows.length);
    expect(rows.map((row) => row.version)).toEqual(
      Array.from({ length: rows.length }, (_, index) => index + 1),
    );
    expect(
      await prisma.auditLog.count({
        where: {
          organizationId: organizationAId,
          eventType: 'SOP_VERSION_UPLOADED',
          entityType: 'SopDocumentVersion',
        },
      }),
    ).toBe(rows.length);
  }, 30_000);

  it('creates no metadata on object failure and compensates an uploaded object on DB failure', async () => {
    const before = await prisma.sopDocumentVersion.count({ where: { siteId: siteAId } });
    const putFailureBytes = pdfBytes('put-failure');
    storage.failPutForSha256(sha256(putFailureBytes));
    const uploadFailure = await upload(
      ownerToken,
      organizationAId,
      siteAId,
      putFailureBytes,
      'put-failure.pdf',
    );
    expect(uploadFailure.status).toBe(500);
    expect(await prisma.sopDocumentVersion.count({ where: { siteId: siteAId } })).toBe(before);

    const transactionSpy = vi
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(new Error('forced DB failure'));
    const dbFailure = await upload(
      ownerToken,
      organizationAId,
      siteAId,
      pdfBytes('db-failure'),
      'db-failure.pdf',
    );
    transactionSpy.mockRestore();
    expect(dbFailure.status).toBe(500);
    expect(storage.deleteCount).toBeGreaterThan(0);
    expect(await prisma.sopDocumentVersion.count({ where: { siteId: siteAId } })).toBe(before);
  });

  it('creates sanitized upload audit and returns stable missing-object errors', async () => {
    const active = await activeSop(ownerToken, organizationAId, siteAId);
    const documentId = active.body.data.id as string;
    const document = await prisma.sopDocumentVersion.findUniqueOrThrow({
      where: { id: documentId },
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { eventType: 'SOP_VERSION_UPLOADED', entityId: documentId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.metadata).toMatchObject({
      documentId,
      sizeBytes: document.sizeBytes,
      sha256: document.sha256,
    });
    expect(audit.metadata).not.toHaveProperty('objectKey');
    expect(audit.metadata).not.toHaveProperty('bytes');
    expect(audit.metadata).not.toHaveProperty('bucket');
    expect(audit.metadata).not.toHaveProperty('endpoint');
    storage.objects.delete(document.objectKey);
    const response = await sopContent(ownerToken, organizationAId, documentId);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('SOP_DOCUMENT_NOT_FOUND');
  });

  async function login(email: string): Promise<string> {
    const response = await send(
      http
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({ email, password }),
    );
    return response.body.accessToken as string;
  }

  function authenticated(
    method: 'get' | 'put' | 'post',
    path: string,
    token: string,
    organizationId: string,
  ): SuperTestRequest {
    return http[method](path)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Organization-Id', organizationId);
  }

  function sendMap(
    token: string,
    organizationId: string,
    siteId: string,
    body: ReturnType<typeof mapPayload>,
  ) {
    return send(
      authenticated('put', `/api/v1/sites/${siteId}/map-config`, token, organizationId).send(body),
    );
  }

  function getMap(token: string, organizationId: string, siteId: string) {
    return send(authenticated('get', `/api/v1/sites/${siteId}/map-config`, token, organizationId));
  }

  function overview(token: string, organizationId: string, siteId: string) {
    return send(
      authenticated('get', `/api/v1/map/overview?siteId=${siteId}`, token, organizationId),
    );
  }

  function upload(
    token: string,
    organizationId: string,
    siteId: string,
    bytes: Buffer,
    filename: string,
    contentType = 'application/pdf',
  ) {
    return send(
      authenticated('post', `/api/v1/sites/${siteId}/sop`, token, organizationId)
        .field('title', 'SOP Resmi')
        .field('description', 'Dokumen pengujian')
        .attach('file', bytes, { filename, contentType }),
    );
  }

  function activeSop(token: string, organizationId: string, siteId: string) {
    return send(authenticated('get', `/api/v1/sites/${siteId}/sop`, token, organizationId));
  }

  function listSop(token: string, organizationId: string, siteId: string) {
    return send(
      authenticated('get', `/api/v1/sites/${siteId}/sop/versions`, token, organizationId),
    );
  }

  function sopContent(token: string, organizationId: string, documentId: string) {
    return send(
      authenticated('get', `/api/v1/sop-documents/${documentId}/content`, token, organizationId),
    );
  }

  function mapAuditCount() {
    return prisma.auditLog.count({
      where: { organizationId: organizationAId, eventType: 'MAP_CONFIG_VERSION_CREATED' },
    });
  }

  function mapPayload(expectedVersion: number | null, notes: string | null = null) {
    return {
      expectedVersion,
      center: { position: [105.267, -5.397], zoom: 16 },
      monitoringPointLocations: [{ monitoringPointId: pointAId, position: [105.2671, -5.3971] }],
      riskZones: [],
      evacuationRoutes: [],
      notes,
    };
  }

  function send(test: SuperTestRequest) {
    requestSequence += 1;
    return test.set('X-Request-Id', `p6-${run}-${requestSequence}`);
  }
});

class TestObjectStorage implements ObjectStorageService {
  readonly objects = new Map<string, StoredObject>();
  private readonly failingPutSha256 = new Set<string>();
  deleteCount = 0;

  failPutForSha256(sha256: string): void {
    this.failingPutSha256.add(sha256);
  }

  async put(input: PutObjectInput): Promise<void> {
    if (this.failingPutSha256.delete(input.sha256)) {
      throw new Error('simulated storage failure');
    }
    this.objects.set(input.key, { body: Buffer.from(input.body), contentType: input.contentType });
  }

  async get(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.deleteCount += 1;
    this.objects.delete(key);
  }
}

function pdfBytes(marker = 'example'): Buffer {
  return Buffer.from(`%PDF-1.7\n${marker}\n%%EOF`, 'ascii');
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function setTestEnvironment(): void {
  process.env.NODE_ENV = 'test';
  process.env.WEB_URL = 'http://localhost:3000';
  process.env.AUTH_ACCESS_TOKEN_SECRET ??= 'phase-06-test-secret-with-at-least-32-characters';
}
