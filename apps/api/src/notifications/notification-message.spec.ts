import { describe, expect, it } from 'vitest';

import { parseAppConfig } from '../config/app-config.js';
import { formatTelegramRiskMessage } from './notification-message.js';
import type { RiskTransitionNotificationPayload } from './notification.types.js';

const config = parseAppConfig({
  DATABASE_URL: 'postgresql://user:password@localhost:55432/database',
  AUTH_ACCESS_TOKEN_SECRET: 'a-development-only-secret-with-32-characters',
  WEB_URL: 'https://siagalongsor.example',
}).telegram;

function payload(
  override: Partial<RiskTransitionNotificationPayload> = {},
): RiskTransitionNotificationPayload {
  return {
    schemaVersion: 1,
    eventId: 'audit-1',
    previousStatus: 'WATCH',
    currentStatus: 'DANGER',
    reasons: ['DANGER_TILT', 'DANGER_PROLONGED_RAINFALL'],
    occurredAt: '2026-08-13T13:15:00.000Z',
    organizationId: 'organization-1',
    siteId: 'site-1',
    siteName: 'SMAN 17 Bandar Lampung',
    siteTimezone: 'Asia/Jakarta',
    monitoringPointId: 'point-1',
    monitoringPointName: 'Lereng Utama',
    telemetryId: 'telemetry-1',
    sensorSnapshot: {
      tiltMagnitudeDeg: 8.42,
      soilMoisturePct: 87.3,
      rainfallMmHour: 54.6,
    },
    rainfallDuration: {
      consecutiveModerateDays: 3,
      previousDailyTotalsMm: [31, 42, 48],
    },
    ...override,
  };
}

describe('formatTelegramRiskMessage', () => {
  it('formats an Indonesian danger notification with its authoritative context', () => {
    const message = formatTelegramRiskMessage(payload(), config);

    expect(message).toContain('SIAGALONGSOR — BAHAYA');
    expect(message).toContain('Status: WASPADA → BAHAYA');
    expect(message).toContain('SMAN 17 Bandar Lampung / Lereng Utama');
    expect(message).toContain('Kemiringan mencapai ambang bahaya');
    expect(message).toContain('Durasi hujan sedang: 3 hari berturut-turut');
    expect(message).toContain('https://siagalongsor.example/overview');
    expect(message).toContain('ID kejadian: audit-1');
  });

  it('states that UNKNOWN is not safe and preserves missing readings', () => {
    const message = formatTelegramRiskMessage(
      payload({
        currentStatus: 'UNKNOWN',
        reasons: ['DEVICE_OFFLINE'],
        sensorSnapshot: {
          tiltMagnitudeDeg: null,
          soilMoisturePct: null,
          rainfallMmHour: null,
        },
        rainfallDuration: null,
      }),
      config,
    );

    expect(message).toContain('TIDAK DIKETAHUI');
    expect(message).toContain('Status ini bukan kondisi aman');
    expect(message).toContain('Kemiringan: tidak tersedia');
  });
});
