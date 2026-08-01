import type { DashboardSummary, SensorSeriesResponse } from '../src/dashboard/dashboard-contracts';
import { alertFixture, overviewFixture } from './phase-03-fixtures';

export const dashboardSummaryFixture: DashboardSummary = {
  generatedAt: '2026-08-01T03:00:00.000Z',
  window: {
    hours: 24,
    from: '2026-07-31T03:00:00.000Z',
    to: '2026-08-01T03:00:00.000Z',
  },
  monitoringPoints: { total: 6, active: 5, inactive: 1 },
  riskDistribution: { safe: 2, watch: 1, danger: 1, unknown: 1 },
  devices: { total: 7, enabled: 5, disabled: 2 },
  connectivityDistribution: { online: 2, delayed: 1, offline: 1, unknown: 1 },
  alerts: { active: 4, activeCritical: 2, newInWindow: 2 },
};

export const sensorSeriesFixture: SensorSeriesResponse = {
  data: {
    items: [
      {
        telemetryId: 'telemetry-1',
        deviceId: 'device-phase-03',
        recordedAt: '2026-08-01T01:00:00.000Z',
        serverReceivedAt: '2026-08-01T01:00:02.000Z',
        isLate: false,
        tiltMagnitudeDeg: 2.4,
        soilMoisturePct: 61.2,
        rainfallMmHour: 8.5,
        batteryVoltage: 12.6,
      },
      {
        telemetryId: 'telemetry-2',
        deviceId: 'device-phase-03',
        recordedAt: '2026-08-01T01:10:00.000Z',
        serverReceivedAt: '2026-08-01T02:42:00.000Z',
        isLate: true,
        tiltMagnitudeDeg: 2.8,
        soilMoisturePct: 63.4,
        rainfallMmHour: 10.1,
        batteryVoltage: null,
      },
      {
        telemetryId: 'telemetry-3',
        deviceId: 'device-phase-03',
        recordedAt: '2026-08-01T02:00:00.000Z',
        serverReceivedAt: '2026-08-01T02:00:03.000Z',
        isLate: false,
        tiltMagnitudeDeg: 4.1,
        soilMoisturePct: 71.8,
        rainfallMmHour: 23.7,
        batteryVoltage: 12.4,
      },
    ],
    nextCursor: null,
    hasMore: false,
  },
};

export { alertFixture, overviewFixture };
