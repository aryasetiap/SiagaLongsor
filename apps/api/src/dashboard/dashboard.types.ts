import type { ConnectivityStatus, RiskLevel } from '../generated/prisma/enums.js';

export interface DashboardWindow {
  readonly hours: number;
  readonly from: string;
  readonly to: string;
}

export interface DashboardSummaryData {
  readonly generatedAt: string;
  readonly window: DashboardWindow;
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

export interface DashboardSummaryResponse {
  readonly data: DashboardSummaryData;
}

export interface SensorSeriesItem {
  readonly telemetryId: string;
  readonly deviceId: string;
  readonly recordedAt: string;
  readonly serverReceivedAt: string;
  readonly isLate: boolean;
  readonly tiltMagnitudeDeg: number | null;
  readonly soilMoisturePct: number | null;
  readonly rainfallMmHour: number | null;
  readonly batteryVoltage: number | null;
}

export interface SensorSeriesResponse {
  readonly data: {
    readonly items: readonly SensorSeriesItem[];
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  };
}

export interface NormalizedSensorRange {
  readonly from: Date;
  readonly to: Date;
}
