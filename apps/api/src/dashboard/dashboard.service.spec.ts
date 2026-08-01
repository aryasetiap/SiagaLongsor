import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import type { AppConfig } from '../config/app-config.js';
import { ConnectivityStatus, DeviceLifecycleStatus, RiskLevel } from '../generated/prisma/enums.js';
import {
  buildDashboardSummary,
  buildNewAlertWhere,
  normalizeDashboardWindow,
  normalizeSensorSeriesRange,
  sensorBoundaryWhere,
  toSensorSeriesItem,
} from './dashboard.service.js';
import { DashboardSummaryQueryDto } from './dto/dashboard.dto.js';
import { SensorSeriesCursorService } from './sensor-series-cursor.service.js';

const NOW = new Date('2026-08-01T03:00:00.000Z');

describe('Dashboard foundation', () => {
  it('applies default, minimum, and maximum windowHours validation', async () => {
    const defaultQuery = plainToInstance(DashboardSummaryQueryDto, {});
    const minimum = plainToInstance(DashboardSummaryQueryDto, { windowHours: '1' });
    const maximum = plainToInstance(DashboardSummaryQueryDto, { windowHours: '168' });
    const below = plainToInstance(DashboardSummaryQueryDto, { windowHours: '0' });
    const above = plainToInstance(DashboardSummaryQueryDto, { windowHours: '169' });

    expect(defaultQuery.windowHours).toBe(24);
    expect(await validate(minimum)).toHaveLength(0);
    expect(await validate(maximum)).toHaveLength(0);
    expect(await validate(below)).not.toHaveLength(0);
    expect(await validate(above)).not.toHaveLength(0);
  });

  it('normalizes generatedAt and summary window once', () => {
    expect(normalizeDashboardWindow(24, NOW)).toEqual({
      hours: 24,
      from: '2026-07-31T03:00:00.000Z',
      to: NOW.toISOString(),
    });
  });

  it('projects internally consistent aggregates with UNKNOWN fallbacks', () => {
    const points = [
      point('active-safe', true, RiskLevel.SAFE, ConnectivityStatus.ONLINE),
      point('active-offline', true, RiskLevel.SAFE, ConnectivityStatus.OFFLINE),
      point('active-missing', true, null, null),
      point('inactive', false, RiskLevel.DANGER, ConnectivityStatus.ONLINE),
    ];
    const devices = [
      device('enabled-online', DeviceLifecycleStatus.ENABLED, ConnectivityStatus.ONLINE, true),
      device('enabled-missing', DeviceLifecycleStatus.ENABLED, null, false),
      device('disabled', DeviceLifecycleStatus.DISABLED, ConnectivityStatus.OFFLINE, true),
    ];
    const window = normalizeDashboardWindow(24, NOW);
    const summary = buildDashboardSummary(NOW, window, points, devices, {
      activeAlerts: 3,
      activeCriticalAlerts: 1,
      newAlerts: 2,
    });

    expect(summary.monitoringPoints).toEqual({ total: 4, active: 3, inactive: 1 });
    expect(summary.riskDistribution).toEqual({ safe: 1, watch: 0, danger: 0, unknown: 2 });
    expect(summary.devices).toEqual({ total: 3, enabled: 2, disabled: 1 });
    expect(summary.connectivityDistribution).toEqual({
      online: 1,
      delayed: 0,
      offline: 0,
      unknown: 1,
    });
    expect(summary.alerts).toEqual({ active: 3, activeCritical: 1, newInWindow: 2 });
  });

  it('builds new-alert filtering from firstObservedAt with [from,to)', () => {
    const window = normalizeDashboardWindow(24, NOW);
    expect(buildNewAlertWhere({ organizationId: 'org', siteId: 'site' }, window)).toEqual({
      organizationId: 'org',
      siteId: 'site',
      firstObservedAt: {
        gte: new Date('2026-07-31T03:00:00.000Z'),
        lt: NOW,
      },
    });
  });

  it('defaults sensor range to 24 hours from one evaluation time', () => {
    expect(normalizeSensorSeriesRange(undefined, undefined, NOW)).toEqual({
      from: new Date('2026-07-31T03:00:00.000Z'),
      to: NOW,
    });
  });

  it('rejects a sensor range over 168 hours and from >= to', () => {
    expect(() =>
      normalizeSensorSeriesRange('2026-07-24T00:00:00.000Z', NOW.toISOString(), NOW),
    ).toThrowError(
      expect.objectContaining({ response: expect.objectContaining({ code: 'VALIDATION_ERROR' }) }),
    );
    expect(() =>
      normalizeSensorSeriesRange(NOW.toISOString(), NOW.toISOString(), NOW),
    ).toThrowError(
      expect.objectContaining({ response: expect.objectContaining({ code: 'VALIDATION_ERROR' }) }),
    );
  });

  it('binds signed cursors to organization, point, range, and includeLate', () => {
    const cursors = cursorService();
    const range = normalizeSensorSeriesRange(undefined, undefined, NOW);
    const token = cursors.encode(
      'org-a',
      'point-a',
      false,
      { telemetryId: 'telemetry-a', recordedAt: new Date('2026-08-01T02:00:00.000Z') },
      range,
      NOW,
    );
    const query = { includeLate: false, limit: 500 };

    expect(cursors.decode(token, 'org-a', 'point-a', query, NOW)).toMatchObject({
      telemetryId: 'telemetry-a',
      range,
    });
    expect(() => cursors.decode(token, 'org-b', 'point-a', query, NOW)).toThrow();
    expect(() => cursors.decode(token, 'org-a', 'point-b', query, NOW)).toThrow();
    expect(() =>
      cursors.decode(token, 'org-a', 'point-a', { ...query, includeLate: true }, NOW),
    ).toThrow();
    expect(() =>
      cursors.decode(
        token,
        'org-a',
        'point-a',
        { ...query, from: '2026-07-31T04:00:00.000Z' },
        NOW,
      ),
    ).toThrow();
    expect(() =>
      cursors.decode(token, 'org-a', 'point-a', query, new Date(NOW.getTime() + 86_400_000)),
    ).toThrow();
  });

  it('uses telemetryId as the stable tie-breaker for equal recordedAt', () => {
    const recordedAt = new Date('2026-08-01T02:00:00.000Z');
    expect(sensorBoundaryWhere({ recordedAt, telemetryId: 'telemetry-b' })).toEqual({
      OR: [
        { deviceTimestamp: { gt: recordedAt } },
        { deviceTimestamp: recordedAt, id: { gt: 'telemetry-b' } },
      ],
    });
  });

  it('keeps nullable battery values null in the public projection', () => {
    const decimal = (value: number) => ({ toNumber: () => value });
    const item = toSensorSeriesItem({
      id: 'telemetry-a',
      deviceId: 'device-a',
      deviceTimestamp: NOW,
      serverReceivedAt: NOW,
      riskAssessment: { affectsCurrentState: true },
      tiltMagnitudeDeg: decimal(2.5),
      soilMoisturePct: decimal(60),
      rainfallMmHour: decimal(5),
      batteryVoltage: null,
    } as never);

    expect(item.batteryVoltage).toBeNull();
    expect(item.isLate).toBe(false);
  });
});

function point(
  id: string,
  isActive: boolean,
  risk: RiskLevel | null,
  connectivity: ConnectivityStatus | null,
) {
  return {
    id,
    isActive,
    currentState:
      risk === null || connectivity === null
        ? null
        : {
            serverRisk: risk,
            connectivityStatus: connectivity,
            latestTelemetryId: `${id}-telemetry`,
            riskProfileId: `${id}-profile`,
            device: { lifecycleStatus: DeviceLifecycleStatus.ENABLED },
          },
  } as never;
}

function device(
  id: string,
  lifecycleStatus: DeviceLifecycleStatus,
  connectivity: ConnectivityStatus | null,
  hasTelemetry: boolean,
) {
  return {
    id,
    lifecycleStatus,
    currentStates:
      connectivity === null
        ? []
        : [
            {
              connectivityStatus: connectivity,
              latestTelemetryId: hasTelemetry ? `${id}-telemetry` : null,
            },
          ],
  } as never;
}

function cursorService(): SensorSeriesCursorService {
  const config = {
    auth: { accessTokenSecret: 'unit-test-cursor-secret-at-least-32-characters' },
  } as AppConfig;
  return new SensorSeriesCursorService(new SignedCursorService(config));
}
