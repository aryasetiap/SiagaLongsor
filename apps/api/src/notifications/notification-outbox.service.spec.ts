import { describe, expect, it, vi } from 'vitest';

import { parseAppConfig } from '../config/app-config.js';
import type { Prisma } from '../generated/prisma/client.js';
import { NotificationOutboxService } from './notification-outbox.service.js';

const baseEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@localhost:55432/database',
  AUTH_ACCESS_TOKEN_SECRET: 'a-development-only-secret-with-32-characters',
};

const input = {
  auditLogId: 'audit-1',
  organizationId: 'organization-1',
  siteId: 'site-1',
  monitoringPointId: 'point-1',
  telemetryId: 'telemetry-1',
  previousStatus: 'WATCH' as const,
  currentStatus: 'DANGER' as const,
  reasons: ['DANGER_TILT'],
  sensorSnapshot: {
    tiltMagnitudeDeg: 8.1,
    soilMoisturePct: 80,
    rainfallMmHour: 30,
  },
  rainfallDuration: null,
  occurredAt: new Date('2026-08-13T13:15:00.000Z'),
};

describe('NotificationOutboxService', () => {
  it('does not create work while Telegram delivery is disabled', async () => {
    const transaction = transactionMock();
    const service = new NotificationOutboxService(parseAppConfig(baseEnvironment));

    await service.enqueueRiskTransition(transaction.value, input);

    expect(transaction.findMonitoringPoint).not.toHaveBeenCalled();
    expect(transaction.createNotification).not.toHaveBeenCalled();
  });

  it('persists one non-secret event keyed by the immutable audit record', async () => {
    const transaction = transactionMock();
    const token = '123456789:test-token-that-is-long-enough';
    const service = new NotificationOutboxService(
      parseAppConfig({
        ...baseEnvironment,
        TELEGRAM_NOTIFICATIONS_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: token,
        TELEGRAM_CHAT_ID: '-1001234567890',
      }),
    );

    await service.enqueueRiskTransition(transaction.value, input);

    expect(transaction.createNotification).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventKey: 'telegram:risk-transition:audit-1',
        channel: 'TELEGRAM',
        eventType: 'RISK_STATUS_CHANGED',
      }),
    });
    expect(JSON.stringify(transaction.createNotification.mock.calls[0])).not.toContain(token);
  });
});

function transactionMock() {
  const findMonitoringPoint = vi.fn().mockResolvedValue({
    name: 'Lereng Utama',
    site: { name: 'SMAN 17 Bandar Lampung', timezone: 'Asia/Jakarta' },
  });
  const createNotification = vi.fn().mockResolvedValue({ id: 'notification-1' });
  return {
    findMonitoringPoint,
    createNotification,
    value: {
      monitoringPoint: { findUnique: findMonitoringPoint },
      notificationOutbox: { create: createNotification },
    } as unknown as Prisma.TransactionClient,
  };
}
