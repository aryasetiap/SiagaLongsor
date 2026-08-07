import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import argon2 from 'argon2';
import request, {
  type Response as SuperTestResponse,
  type Test as SuperTestRequest,
} from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { configureApp } from '../bootstrap/configure-app.js';
import { PrismaService } from '../database/prisma.service.js';
import { Role } from '../generated/prisma/enums.js';

describe('Site Read API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let ownerToken: string;
  let adminToken: string;

  const testRunId = randomUUID();
  const requestPrefix = `site-read-e2e-${testRunId}`;
  const organizationAId = `site-read-org-a-${testRunId}`;
  const organizationBId = `site-read-org-b-${testRunId}`;
  const organizationCId = `site-read-org-c-${testRunId}`;
  const ownerId = `site-read-owner-${testRunId}`;
  const adminId = `site-read-admin-${testRunId}`;
  const ownerEmail = `site-read-owner-${testRunId}@example.invalid`;
  const adminEmail = `site-read-admin-${testRunId}@example.invalid`;
  const password = `Site-read-password-${randomUUID()}`;
  let requestSequence = 0;
  let siteSequence = 0;

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
        organizationData(organizationAId, 'A'),
        organizationData(organizationBId, 'B'),
        organizationData(organizationCId, 'C'),
      ],
    });
    await prisma.site.createMany({
      data: [
        {
          id: `site-read-base-a-${testRunId}`,
          organizationId: organizationAId,
          name: 'Site Utama Organisasi A',
          slug: `site-read-base-a-${testRunId}`,
          address: null,
          timezone: 'Asia/Jakarta',
        },
        {
          id: `site-read-base-b-${testRunId}`,
          organizationId: organizationBId,
          name: 'Site Organisasi B',
          slug: `site-read-base-b-${testRunId}`,
          address: 'Alamat organisasi B',
          timezone: 'Asia/Jakarta',
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        userData(ownerId, ownerEmail, 'Site Read Owner', passwordHash),
        userData(adminId, adminEmail, 'Site Read Admin', passwordHash),
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
      await prisma.refreshSession.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
      await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, adminId] } } });
      await prisma.site.deleteMany({
        where: {
          organizationId: { in: [organizationAId, organizationBId, organizationCId] },
        },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationAId, organizationBId, organizationCId] } },
      });
    }
    await app?.close();
  });

  it('requires bearer authentication', async () => {
    const response = await send(
      http.get('/api/v1/sites').set('X-Organization-Id', organizationAId),
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('ACCESS_TOKEN_REQUIRED');
  });

  it('requires X-Organization-Id', async () => {
    const response = await send(
      http.get('/api/v1/sites').set('Authorization', `Bearer ${ownerToken}`),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ORGANIZATION_CONTEXT_REQUIRED');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('rejects an organization without active membership', async () => {
    const response = await getList(ownerToken, organizationCId);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORGANIZATION_ACCESS_DENIED');
  });

  it('allows PROJECT_OWNER and SCHOOL_ADMIN to list sites', async () => {
    const [ownerResponse, adminResponse] = await Promise.all([
      getList(ownerToken, organizationAId),
      getList(adminToken, organizationAId),
    ]);

    expect(ownerResponse.status).toBe(200);
    expect(adminResponse.status).toBe(200);
    expect(ownerResponse.body.data).toHaveLength(1);
    expect(adminResponse.body.data).toEqual(ownerResponse.body.data);
  });

  it('isolates organizations and returns only the public projection with nullable address', async () => {
    const response = await getList(ownerToken, organizationAId);
    const site = response.body.data[0] as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(Object.keys(site).sort()).toEqual(['address', 'id', 'name', 'timezone']);
    expect(site).toMatchObject({
      id: `site-read-base-a-${testRunId}`,
      name: 'Site Utama Organisasi A',
      address: null,
      timezone: 'Asia/Jakarta',
    });
    expect(JSON.stringify(response.body)).not.toContain('Site Organisasi B');
    expect(response.body).not.toHaveProperty('totalCount');
    expect(response.body.page).not.toHaveProperty('totalCount');
  });

  it('applies default and maximum limits and rejects values above 100', async () => {
    const marker = `Limit ${testRunId}`;
    await prisma.site.createMany({
      data: Array.from({ length: 101 }, (_value, index) => ({
        organizationId: organizationAId,
        name: `${marker} ${String(index).padStart(3, '0')}`,
        slug: nextSlug(),
      })),
    });

    const search = `search=${encodeURIComponent(marker)}`;
    const [defaultPage, maximumPage, tooLarge] = await Promise.all([
      getList(ownerToken, organizationAId, search),
      getList(ownerToken, organizationAId, `${search}&limit=100`),
      getList(ownerToken, organizationAId, `${search}&limit=101`),
    ]);

    expect(defaultPage.status).toBe(200);
    expect(defaultPage.body.data).toHaveLength(25);
    expect(defaultPage.body.page.hasMore).toBe(true);
    expect(maximumPage.body.data).toHaveLength(100);
    expect(maximumPage.body.page.hasMore).toBe(true);
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects search longer than 100 characters', async () => {
    const response = await getList(
      ownerToken,
      organizationAId,
      `search=${encodeURIComponent('x'.repeat(101))}`,
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('searches name and address case-insensitively without cross-organization leakage', async () => {
    const marker = `Search-${testRunId}`;
    await Promise.all([
      directSite(organizationAId, `${marker} Nama`, 'Alamat biasa'),
      directSite(organizationAId, 'Nama biasa', `Jalan ${marker}`),
      directSite(organizationBId, `${marker} Rahasia`, `Alamat ${marker}`),
    ]);

    const response = await getList(
      ownerToken,
      organizationAId,
      `search=${encodeURIComponent(marker.toLowerCase())}&limit=100`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(
      response.body.data.every((site: { name: string }) => !site.name.includes('Rahasia')),
    ).toBe(true);
  });

  it('supports default name ascending, name descending, and createdAt descending sorting', async () => {
    const marker = `Sort ${testRunId}`;
    await Promise.all([
      directSite(organizationAId, `${marker} Bravo`, null, new Date('2025-01-02T00:00:00.000Z')),
      directSite(organizationAId, `${marker} Alpha`, null, new Date('2025-01-01T00:00:00.000Z')),
      directSite(organizationAId, `${marker} Charlie`, null, new Date('2025-01-03T00:00:00.000Z')),
    ]);
    const search = `search=${encodeURIComponent(marker)}&limit=100`;
    const [ascending, descending, newest] = await Promise.all([
      getList(ownerToken, organizationAId, search),
      getList(ownerToken, organizationAId, `${search}&sort=name:desc`),
      getList(ownerToken, organizationAId, `${search}&sort=createdAt:desc`),
    ]);

    expect(names(ascending)).toEqual([`${marker} Alpha`, `${marker} Bravo`, `${marker} Charlie`]);
    expect(names(descending)).toEqual([`${marker} Charlie`, `${marker} Bravo`, `${marker} Alpha`]);
    expect(names(newest)).toEqual([`${marker} Charlie`, `${marker} Bravo`, `${marker} Alpha`]);
  });

  it('paginates stably and uses id as tie-breaker for duplicate names', async () => {
    const marker = `Same Name ${testRunId}`;
    const expectedIds = [
      `site-read-tie-a-${testRunId}`,
      `site-read-tie-b-${testRunId}`,
      `site-read-tie-c-${testRunId}`,
    ];
    await prisma.site.createMany({
      data: expectedIds.map((id) => ({
        id,
        organizationId: organizationAId,
        name: marker,
        slug: nextSlug(),
      })),
    });
    const query = `search=${encodeURIComponent(marker)}&limit=2`;
    const first = await getList(ownerToken, organizationAId, query);
    const second = await getList(
      ownerToken,
      organizationAId,
      `${query}&cursor=${encodeURIComponent(first.body.page.nextCursor as string)}`,
    );
    const ids = [...first.body.data, ...second.body.data].map((site: { id: string }) => site.id);

    expect(first.status).toBe(200);
    expect(first.body.page.hasMore).toBe(true);
    expect(first.body.page.nextCursor).toEqual(expect.any(String));
    expect(second.body.page.hasMore).toBe(false);
    expect(ids).toEqual(expectedIds);
    expect(new Set(ids).size).toBe(3);
  });

  it('rejects malformed cursors', async () => {
    const response = await getList(ownerToken, organizationAId, 'cursor=not-a-valid-cursor');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CURSOR');
  });

  it('rejects cursor reuse with a different search or sort', async () => {
    const marker = `Bound ${testRunId}`;
    await Promise.all([
      directSite(organizationAId, `${marker} A`),
      directSite(organizationAId, `${marker} B`),
      directSite(organizationAId, `${marker} C`),
    ]);
    const first = await getList(
      ownerToken,
      organizationAId,
      `search=${encodeURIComponent(marker)}&sort=name:asc&limit=1`,
    );
    const cursor = encodeURIComponent(first.body.page.nextCursor as string);
    const [differentSearch, differentSort] = await Promise.all([
      getList(
        ownerToken,
        organizationAId,
        `search=${encodeURIComponent(`${marker} A`)}&sort=name:asc&cursor=${cursor}`,
      ),
      getList(
        ownerToken,
        organizationAId,
        `search=${encodeURIComponent(marker)}&sort=name:desc&cursor=${cursor}`,
      ),
    ]);

    expect(differentSearch.status).toBe(400);
    expect(differentSearch.body.error.code).toBe('INVALID_CURSOR');
    expect(differentSort.status).toBe(400);
    expect(differentSort.body.error.code).toBe('INVALID_CURSOR');
  });

  it('rejects cursor reuse with a different organization even when membership is valid', async () => {
    const marker = `Organization Cursor ${testRunId}`;
    await Promise.all([
      directSite(organizationAId, `${marker} A`),
      directSite(organizationAId, `${marker} B`),
      directSite(organizationBId, `${marker} B`),
    ]);
    const first = await getList(
      ownerToken,
      organizationAId,
      `search=${encodeURIComponent(marker)}&limit=1`,
    );
    const response = await getList(
      ownerToken,
      organizationBId,
      `search=${encodeURIComponent(marker)}&cursor=${encodeURIComponent(
        first.body.page.nextCursor as string,
      )}`,
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CURSOR');
  });

  async function login(email: string): Promise<string> {
    const response = await send(http.post('/api/v1/auth/login').send({ email, password }));
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  function getList(token: string, organizationId: string, query = '') {
    return send(
      http
        .get(`/api/v1/sites${query.length === 0 ? '' : `?${query}`}`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', organizationId),
    );
  }

  function send(agent: SuperTestRequest): Promise<SuperTestResponse> {
    requestSequence += 1;
    return agent.set('x-request-id', `${requestPrefix}-${requestSequence}`);
  }

  function directSite(
    organizationId: string,
    name: string,
    address: string | null = null,
    createdAt?: Date,
  ) {
    return prisma.site.create({
      data: {
        organizationId,
        name,
        slug: nextSlug(),
        address,
        ...(createdAt === undefined ? {} : { createdAt }),
      },
    });
  }

  function nextSlug(): string {
    siteSequence += 1;
    return `site-read-${testRunId}-${siteSequence}`;
  }
});

function names(response: SuperTestResponse): string[] {
  return response.body.data.map((site: { name: string }) => site.name) as string[];
}

function organizationData(id: string, suffix: string): { id: string; name: string; slug: string } {
  return {
    id,
    name: `Site Read Organization ${suffix}`,
    slug: `site-read-org-${suffix.toLowerCase()}-${id.slice(-12)}`,
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
