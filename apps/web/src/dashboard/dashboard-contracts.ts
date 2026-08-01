import type { PageInfo } from '../api/contracts';
import type { ConnectivityStatus, RiskLevel } from '../risk/risk-contracts';

export type DashboardWindowHours = 24 | 72 | 168;

export interface DashboardSummary {
  readonly generatedAt: string;
  readonly window: { readonly hours: number; readonly from: string; readonly to: string };
  readonly monitoringPoints: {
    readonly total: number;
    readonly active: number;
    readonly inactive: number;
  };
  readonly riskDistribution: Record<Lowercase<RiskLevel>, number>;
  readonly devices: { readonly total: number; readonly enabled: number; readonly disabled: number };
  readonly connectivityDistribution: Record<Lowercase<ConnectivityStatus>, number>;
  readonly alerts: {
    readonly active: number;
    readonly activeCritical: number;
    readonly newInWindow: number;
  };
}

export interface DashboardSummaryQuery {
  readonly siteId?: string;
  readonly windowHours?: DashboardWindowHours;
}

export interface SensorSeriesPoint {
  readonly telemetryId: string;
  readonly deviceId: string;
  readonly recordedAt: string;
  readonly serverReceivedAt: string;
  readonly isLate: boolean;
  readonly tiltMagnitudeDeg: number;
  readonly soilMoisturePct: number;
  readonly rainfallMmHour: number;
  readonly batteryVoltage: number | null;
}

export interface SensorSeriesResponse {
  readonly data: {
    readonly items: readonly SensorSeriesPoint[];
    readonly nextCursor: PageInfo['nextCursor'];
    readonly hasMore: PageInfo['hasMore'];
  };
}

export interface SensorSeriesQuery {
  readonly from?: string;
  readonly to?: string;
  readonly includeLate?: boolean;
  readonly cursor?: string;
  readonly limit?: number;
}

export type SensorKey = 'tilt' | 'moisture' | 'rainfall' | 'battery';
