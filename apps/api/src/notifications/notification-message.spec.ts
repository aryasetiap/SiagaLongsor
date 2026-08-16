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

    expect(message).toContain('TEKNILA SIAGA LONGSOR — AWAS (TINGKAT 3)');
    expect(message).toContain('Status: WASPADA (TINGKAT 1) → AWAS (TINGKAT 3)');
    expect(message).toContain(
      'Skema: Aman → Waspada (Tingkat 1) → Siaga (Tingkat 2) → Awas (Tingkat 3)',
    );
    expect(message).toContain('SMAN 17 Bandar Lampung / Lereng Utama');
    expect(message).toContain('Kemiringan mencapai ambang Awas (Tingkat 3)');
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

  it('uses Aman outside the three warning levels', () => {
    const message = formatTelegramRiskMessage(
      payload({ previousStatus: 'WATCH', currentStatus: 'SAFE', reasons: ['SAFE_THRESHOLDS_MET'] }),
      config,
    );

    expect(message).toContain('TEKNILA SIAGA LONGSOR — AMAN');
    expect(message).toContain('AMAN: pembacaan berada di bawah ambang Waspada');
    expect(message).not.toContain('kembali aman');
  });

  it('formats WARNING as Siaga Tingkat 2', () => {
    const message = formatTelegramRiskMessage(
      payload({
        previousStatus: 'WATCH',
        currentStatus: 'WARNING',
        reasons: ['WARNING_TILT'],
      }),
      config,
    );

    expect(message).toContain('TEKNILA SIAGA LONGSOR — SIAGA (TINGKAT 2)');
    expect(message).toContain('SIAGA: tingkatkan pemantauan');
  });
});
