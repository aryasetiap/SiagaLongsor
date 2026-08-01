import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../app.module.js';
import { configureApp } from '../bootstrap/configure-app.js';
import { PrismaService } from '../database/prisma.service.js';
import { AlertStatus, AlertType, Role } from '../generated/prisma/enums.js';
import { AlertLifecyclePostCommit } from './alert-lifecycle-post-commit.js';
import type { AlertLifecycleCommittedEvent } from './alert-lifecycle.types.js';
import { alertDeduplicationKey, AlertObservationService } from './alert-observation.service.js';

describe('Phase 05 alert lifecycle and audit APIs', () => {
  const runId = randomUUID();
  const organizationAId = `phase05-org-a-${runId}`;
  const organizationBId = `phase05-org-b-${runId}`;
  const siteAId = `phase05-site-a-${runId}`;
  const siteBId = `phase05-site-b-${runId}`;
  const pointAId = `phase05-point-a-${runId}`;
  const pointBId = `phase05-point-b-${runId}`;
  const ownerId = `phase05-owner-${runId}`;
  const adminId = `phase05-admin-${runId}`;
  const ownerEmail = `phase05-owner-${runId}@example.invalid`;
  const adminEmail = `phase05-admin-${runId}@example.invalid`;
  const password = `Phase05-${randomUUID()}`;
  const committedEvents: AlertLifecycleCommittedEvent[] = [];

  let app: INestApplication;
  let prisma: PrismaService;
  let observations: AlertObservationService;
  let http: ReturnType<typeof request>;
  let ownerToken: string;
  let adminToken: string;
  let alertSequence = 0;

  beforeAll(async () => {
    const postCommit = {
      dispatch: vi.fn(async (event: AlertLifecycleCommittedEvent) => {
        const persisted = await prisma.alertLifecycleAction.findFirst({
          where: { alertId: event.alertId, organizationId: event.organizationId },
        });
        if (persisted === null) throw new Error('Descriptor emitted before commit');
        committedEvents.push(event);
      }),
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AlertLifecyclePostCommit)
      .useValue(postCommit)
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaService);
    observations = app.get(AlertObservationService);
    http = request(app.getHttpServer());

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'Phase 05 Organization A', slug: `p5-a-${runId}` },
        { id: organizationBId, name: 'Phase 05 Organization B', slug: `p5-b-${runId}` },
      ],
    });
    await prisma.site.createMany({
      data: [
        {
          id: siteAId,
          organizationId: organizationAId,
          name: 'Phase 05 Site A',
          slug: `a-${runId}`,
        },
        {
          id: siteBId,
          organizationId: organizationBId,
          name: 'Phase 05 Site B',
          slug: `b-${runId}`,
        },
      ],
    });
    await prisma.monitoringPoint.createMany({
      data: [
        { id: pointAId, organizationId: organizationAId, siteId: siteAId, name: 'Point A' },
        { id: pointBId, organizationId: organizationBId, siteId: siteBId, name: 'Point B' },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          email: ownerEmail,
          normalizedEmail: ownerEmail,
          name: 'Phase 05 Owner',
          passwordHash,
        },
        {
          id: adminId,
          email: adminEmail,
          normalizedEmail: adminEmail,
          name: 'Phase 05 Admin',
          passwordHash,
        },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { organizationId: organizationAId, userId: ownerId, role: Role.PROJECT_OWNER },
        { organizationId: organizationAId, userId: adminId, role: Role.SCHOOL_ADMIN },
      ],
    });
    ownerToken = await login(ownerEmail);
    adminToken = await login(adminEmail);
  }, 30_000);

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
      await prisma.refreshSession.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
      await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, adminId] } } });
      await prisma.monitoringPoint.deleteMany({ where: { id: { in: [pointAId, pointBId] } } });
      await prisma.site.deleteMany({ where: { id: { in: [siteAId, siteBId] } } });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationAId, organizationBId] } },
      });
    }
    await app?.close();
  });

  it('allows owner and admin to acknowledge ACTIVE with atomic event, audit, and idempotency', async () => {
    for (const token of [ownerToken, adminToken]) {
      const alert = await createAlert();
      const actionId = randomUUID();
      const response = await action(
        token,
        alert.id,
        'acknowledge',
        actionId,
        acknowledgeBody(actionId),
      );
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('ACKNOWLEDGED');
      expect(response.body.action).toMatchObject({
        actionId,
        previousStatus: 'ACTIVE',
        nextStatus: 'ACKNOWLEDGED',
      });
      const [stored, eventCount, auditCount] = await Promise.all([
        prisma.alertLifecycleAction.findUnique({ where: { actionId } }),
        prisma.alertEvent.count({ where: { alertId: alert.id, eventType: 'ALERT_ACKNOWLEDGED' } }),
        prisma.auditLog.count({ where: { entityId: alert.id, eventType: 'ALERT_ACKNOWLEDGED' } }),
      ]);
      expect(stored?.payloadHash).toMatch(/^[a-f0-9]{64}$/);
      expect(eventCount).toBe(1);
      expect(auditCount).toBe(1);
    }
    expect(committedEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('implements owner resolve and false-alarm transitions from the exact allowed states', async () => {
    const resolveAlert = await createAlert();
    await acknowledge(resolveAlert.id);
    const resolveId = randomUUID();
    expect(
      (
        await action(ownerToken, resolveAlert.id, 'resolve', resolveId, {
          actionId: resolveId,
          resolutionNote: '  Stabil  ',
        })
      ).body.data.status,
    ).toBe('RESOLVED');

    const activeFalse = await createAlert();
    const activeFalseId = randomUUID();
    expect(
      (
        await action(ownerToken, activeFalse.id, 'false-alarm', activeFalseId, {
          actionId: activeFalseId,
          reason: ' Sensor bergeser ',
        })
      ).body.data.status,
    ).toBe('FALSE_ALARM');

    const acknowledgedFalse = await createAlert();
    await acknowledge(acknowledgedFalse.id);
    const acknowledgedFalseId = randomUUID();
    expect(
      (
        await action(ownerToken, acknowledgedFalse.id, 'false-alarm', acknowledgedFalseId, {
          actionId: acknowledgedFalseId,
          reason: 'Bukan kondisi lereng',
        })
      ).body.data.status,
    ).toBe('FALSE_ALARM');
  });

  it('enforces role authorization and organization isolation', async () => {
    const alert = await createAlert();
    const resolveId = randomUUID();
    expect(
      (
        await action(adminToken, alert.id, 'resolve', resolveId, {
          actionId: resolveId,
          resolutionNote: 'ditolak',
        })
      ).status,
    ).toBe(403);
    const falseId = randomUUID();
    expect(
      (
        await action(adminToken, alert.id, 'false-alarm', falseId, {
          actionId: falseId,
          reason: 'ditolak',
        })
      ).status,
    ).toBe(403);
    const other = await createAlert(organizationBId);
    const crossId = randomUUID();
    const cross = await action(
      ownerToken,
      other.id,
      'acknowledge',
      crossId,
      acknowledgeBody(crossId),
    );
    expect(cross.status).toBe(404);
    expect(cross.body.error.code).toBe('ALERT_NOT_FOUND');
  });

  it('validates UUID, trim bounds, and header equality', async () => {
    const alert = await createAlert();
    const actionId = randomUUID();
    const mismatch = await http
      .post(`/api/v1/alerts/${alert.id}/acknowledge`)
      .set(authHeaders(ownerToken))
      .set('Idempotency-Key', randomUUID())
      .send(acknowledgeBody(actionId));
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
    const invalid = await http
      .post(`/api/v1/alerts/${alert.id}/acknowledge`)
      .set(authHeaders(ownerToken))
      .set('Idempotency-Key', 'not-a-uuid')
      .send({ actionId: 'not-a-uuid', note: ' ', fieldCondition: ' ', sopExecuted: true });
    expect(invalid.status).toBe(400);
  });

  it('replays the original result after later lifecycle state without duplicate writes', async () => {
    const alert = await createAlert();
    const acknowledgeId = randomUUID();
    const body = acknowledgeBody(acknowledgeId);
    const first = await action(ownerToken, alert.id, 'acknowledge', acknowledgeId, body);
    const emittedAfterFirst = committedEvents.length;
    const resolveId = randomUUID();
    await action(ownerToken, alert.id, 'resolve', resolveId, {
      actionId: resolveId,
      resolutionNote: 'Selesai',
    });
    const replay = await action(ownerToken, alert.id, 'acknowledge', acknowledgeId, body);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(replay.body.data.status).toBe('ACKNOWLEDGED');
    expect(committedEvents).toHaveLength(emittedAfterFirst + 1);
    expect(await prisma.alertLifecycleAction.count({ where: { alertId: alert.id } })).toBe(2);
    expect(await prisma.alertEvent.count({ where: { alertId: alert.id } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { entityId: alert.id } })).toBe(2);
  });

  it('rejects reused actionId for changed payload, action, or Alert', async () => {
    const firstAlert = await createAlert();
    const secondAlert = await createAlert();
    const actionId = randomUUID();
    await action(ownerToken, firstAlert.id, 'acknowledge', actionId, acknowledgeBody(actionId));
    const changed = await action(ownerToken, firstAlert.id, 'acknowledge', actionId, {
      ...acknowledgeBody(actionId),
      note: 'Berbeda',
    });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    const otherAlert = await action(
      ownerToken,
      secondAlert.id,
      'acknowledge',
      actionId,
      acknowledgeBody(actionId),
    );
    expect(otherAlert.status).toBe(409);
    const otherAction = await action(ownerToken, firstAlert.id, 'resolve', actionId, {
      actionId,
      resolutionNote: 'Berbeda aksi',
    });
    expect(otherAction.status).toBe(409);
  });

  it('returns deterministic state conflicts without persistence side effects', async () => {
    const active = await createAlert();
    const directResolveId = randomUUID();
    const direct = await action(ownerToken, active.id, 'resolve', directResolveId, {
      actionId: directResolveId,
      resolutionNote: 'Tidak valid',
    });
    expect(direct.status).toBe(409);
    expect(direct.body.error.code).toBe('ALERT_STATE_CONFLICT');
    await acknowledge(active.id);
    const repeatedId = randomUUID();
    expect(
      (await action(ownerToken, active.id, 'acknowledge', repeatedId, acknowledgeBody(repeatedId)))
        .status,
    ).toBe(409);
    const falseId = randomUUID();
    await action(ownerToken, active.id, 'false-alarm', falseId, {
      actionId: falseId,
      reason: 'Terminal',
    });
    const terminalId = randomUUID();
    expect(
      (
        await action(ownerToken, active.id, 'resolve', terminalId, {
          actionId: terminalId,
          resolutionNote: 'Ditolak',
        })
      ).status,
    ).toBe(409);
    expect(
      await prisma.alertLifecycleAction.findUnique({ where: { actionId: terminalId } }),
    ).toBeNull();
  });

  it('projects paginated sanitized event history to both roles', async () => {
    const alert = await createAlert();
    await acknowledge(alert.id);
    const resolveId = randomUUID();
    await action(ownerToken, alert.id, 'resolve', resolveId, {
      actionId: resolveId,
      resolutionNote: 'Selesai',
    });
    for (const token of [ownerToken, adminToken]) {
      const first = await http
        .get(`/api/v1/alerts/${alert.id}/events?limit=1`)
        .set(authHeaders(token));
      expect(first.status).toBe(200);
      expect(first.body).not.toHaveProperty('totalCount');
      expect(first.body.data).toHaveLength(1);
      expect(first.body.data[0].eventType).toBe('ALERT_RESOLVED');
      expect(first.body.data[0]).not.toHaveProperty('ipAddress');
      expect(first.body.data[0].metadata).not.toHaveProperty('password');
      const next = await http
        .get(
          `/api/v1/alerts/${alert.id}/events?limit=1&cursor=${encodeURIComponent(first.body.page.nextCursor)}`,
        )
        .set(authHeaders(token));
      expect(next.status).toBe(200);
      expect(next.body.data[0].eventType).toBe('ALERT_ACKNOWLEDGED');
    }
  });

  it('provides owner-only database-filtered audit history with date and cursor validation', async () => {
    const alert = await createAlert();
    await acknowledge(alert.id);
    const from = new Date(Date.now() - 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const result = await http
      .get(
        `/api/v1/audit-logs?eventType=ALERT_ACKNOWLEDGED&entityId=${alert.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      .set(authHeaders(ownerToken));
    expect(result.status).toBe(200);
    expect(result.body).not.toHaveProperty('totalCount');
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0]).not.toHaveProperty('ipAddress');
    expect(result.body.data[0]).not.toHaveProperty('userAgent');
    expect(result.body.data[0].metadata).not.toHaveProperty('Authorization');
    expect((await http.get('/api/v1/audit-logs').set(authHeaders(adminToken))).status).toBe(403);
    const invalidRange = await http
      .get(`/api/v1/audit-logs?from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`)
      .set(authHeaders(ownerToken));
    expect(invalidRange.status).toBe(400);
    const boundCursor = await http.get('/api/v1/audit-logs?limit=1').set(authHeaders(ownerToken));
    if (boundCursor.body.page.nextCursor !== null) {
      const changedFilter = await http
        .get(
          `/api/v1/audit-logs?limit=1&eventType=OTHER&cursor=${encodeURIComponent(boundCursor.body.page.nextCursor)}`,
        )
        .set(authHeaders(ownerToken));
      expect(changedFilter.status).toBe(400);
      expect(changedFilter.body.error.code).toBe('INVALID_CURSOR');
    }
  });

  it('serializes concurrent acknowledges with one winner and no duplicate records', async () => {
    const alert = await createAlert();
    const firstId = randomUUID();
    const secondId = randomUUID();
    const responses = await Promise.all([
      action(ownerToken, alert.id, 'acknowledge', firstId, acknowledgeBody(firstId)),
      action(ownerToken, alert.id, 'acknowledge', secondId, acknowledgeBody(secondId)),
    ]);
    expect(responses.map((entry) => entry.status).sort()).toEqual([200, 409]);
    expect(responses.every((entry) => entry.status !== 500)).toBe(true);
    expect(await prisma.alertLifecycleAction.count({ where: { alertId: alert.id } })).toBe(1);
    expect(await prisma.alertEvent.count({ where: { alertId: alert.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: alert.id } })).toBe(1);
  });

  it('replays identical concurrent requests and persists one action', async () => {
    const alert = await createAlert();
    const actionId = randomUUID();
    const body = acknowledgeBody(actionId);
    const responses = await Promise.all([
      action(ownerToken, alert.id, 'acknowledge', actionId, body),
      action(ownerToken, alert.id, 'acknowledge', actionId, body),
    ]);
    expect(responses.map((entry) => entry.status)).toEqual([200, 200]);
    expect(responses[0].body).toEqual(responses[1].body);
    expect(await prisma.alertLifecycleAction.count({ where: { actionId } })).toBe(1);
    expect(await prisma.alertEvent.count({ where: { alertId: alert.id } })).toBe(1);
  });

  it('serializes resolve versus false-alarm with one terminal winner', async () => {
    const alert = await createAlert();
    await acknowledge(alert.id);
    const resolveId = randomUUID();
    const falseId = randomUUID();
    const responses = await Promise.all([
      action(ownerToken, alert.id, 'resolve', resolveId, {
        actionId: resolveId,
        resolutionNote: 'Resolve',
      }),
      action(ownerToken, alert.id, 'false-alarm', falseId, {
        actionId: falseId,
        reason: 'False alarm',
      }),
    ]);
    expect(responses.map((entry) => entry.status).sort()).toEqual([200, 409]);
    expect(responses.every((entry) => entry.status !== 500)).toBe(true);
    const stored = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
    expect([AlertStatus.RESOLVED, AlertStatus.FALSE_ALARM]).toContain(stored.status);
  });

  it('preserves ACKNOWLEDGED during observations and creates a new alert after terminal state', async () => {
    const alert = await createObservedAlert(AlertType.RISK_DANGER);
    await acknowledge(alert.id);
    await observe(`ack-${randomUUID()}`, AlertType.RISK_DANGER);
    const acknowledged = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(acknowledged.status).toBe(AlertStatus.ACKNOWLEDGED);
    expect(acknowledged.occurrenceCount).toBe(2);

    const falseId = randomUUID();
    await action(ownerToken, alert.id, 'false-alarm', falseId, {
      actionId: falseId,
      reason: 'Terminal',
    });
    const created = await observe(`terminal-${randomUUID()}`, AlertType.RISK_DANGER);
    expect(created.id).not.toBe(alert.id);
    expect(created.status).toBe(AlertStatus.ACTIVE);
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).status).toBe(
      AlertStatus.FALSE_ALARM,
    );
  });

  it('does not lose a terminal transition during a concurrent observation', async () => {
    const alert = await createObservedAlert(AlertType.DEVICE_OFFLINE);
    await acknowledge(alert.id);
    const resolveId = randomUUID();
    const [resolved, observation] = await Promise.all([
      action(ownerToken, alert.id, 'resolve', resolveId, {
        actionId: resolveId,
        resolutionNote: 'Concurrent',
      }),
      observe(`race-${randomUUID()}`, AlertType.DEVICE_OFFLINE),
    ]);
    expect(resolved.status).toBe(200);
    expect(observation).toBeDefined();
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).status).toBe(
      AlertStatus.RESOLVED,
    );
  });

  async function createAlert(organizationId = organizationAId) {
    alertSequence += 1;
    const siteId = organizationId === organizationAId ? siteAId : siteBId;
    const monitoringPointId = organizationId === organizationAId ? pointAId : pointBId;
    const observedAt = new Date(Date.now() + alertSequence);
    return prisma.alert.create({
      data: {
        organizationId,
        siteId,
        monitoringPointId,
        deviceId: null,
        type: AlertType.RISK_DANGER,
        severity: 'CRITICAL',
        status: AlertStatus.ACTIVE,
        deduplicationKey: `${organizationId}/${siteId}/${monitoringPointId}/RISK_DANGER/unresolved-${alertSequence}`,
        reasons: ['DANGER_TILT'],
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
      },
    });
  }

  async function createObservedAlert(type: AlertType) {
    alertSequence += 1;
    const observedAt = new Date(Date.now() + alertSequence);
    return prisma.alert.create({
      data: {
        organizationId: organizationAId,
        siteId: siteAId,
        monitoringPointId: pointAId,
        deviceId: null,
        type,
        severity: 'CRITICAL',
        status: AlertStatus.ACTIVE,
        deduplicationKey: alertDeduplicationKey({
          organizationId: organizationAId,
          siteId: siteAId,
          monitoringPointId: pointAId,
          type,
        }),
        reasons: ['DANGER_TILT'],
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
      },
    });
  }

  async function acknowledge(alertId: string) {
    const actionId = randomUUID();
    return action(ownerToken, alertId, 'acknowledge', actionId, acknowledgeBody(actionId));
  }

  async function observe(observationKey: string, type: AlertType) {
    return prisma.$transaction(
      async (transaction) =>
        (
          await observations.observe(transaction, {
            organizationId: organizationAId,
            siteId: siteAId,
            monitoringPointId: pointAId,
            deviceId: null,
            type,
            reasons: ['DANGER_TILT'],
            observedAt: new Date(),
            observationKey,
          })
        ).alert,
    );
  }

  function action(
    token: string,
    alertId: string,
    endpoint: 'acknowledge' | 'resolve' | 'false-alarm',
    actionId: string,
    body: Record<string, unknown>,
  ) {
    return http
      .post(`/api/v1/alerts/${alertId}/${endpoint}`)
      .set(authHeaders(token))
      .set('Idempotency-Key', actionId)
      .send(body);
  }

  function acknowledgeBody(actionId: string) {
    return {
      actionId,
      note: '  Diterima operator  ',
      fieldCondition: '  Area dibatasi  ',
      sopExecuted: true,
    };
  }

  function authHeaders(token: string) {
    return { Authorization: `Bearer ${token}`, 'X-Organization-Id': organizationAId };
  }

  async function login(email: string): Promise<string> {
    const response = await http
      .post('/api/v1/auth/login')
      .set('Origin', process.env.WEB_URL!)
      .send({ email, password });
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }
});
