import type { CursorQuery } from '../api/contracts';

export type RiskLevel = 'SAFE' | 'WATCH' | 'DANGER' | 'UNKNOWN';
export type ConnectivityStatus = 'ONLINE' | 'DELAYED' | 'OFFLINE' | 'UNKNOWN';
export type CalibrationStatus = 'PROVISIONAL' | 'CALIBRATED';
export type AlertType =
  'RISK_WATCH' | 'RISK_DANGER' | 'DEVICE_DELAYED' | 'DEVICE_OFFLINE' | 'DEVICE_SERVER_MISMATCH';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_ALARM';
export type RiskReason =
  | 'SAFE_THRESHOLDS_MET'
  | 'WATCH_THRESHOLDS_MET'
  | 'DANGER_TILT'
  | 'DANGER_RAIN_MOISTURE'
  | 'REQUIRED_SENSOR_MISSING'
  | 'REQUIRED_SENSOR_INVALID'
  | 'DEVICE_DISABLED'
  | 'TELEMETRY_DELAYED'
  | 'DEVICE_OFFLINE'
  | 'TIMESTAMP_UNTRUSTED'
  | 'PROFILE_UNAVAILABLE'
  | 'DEVICE_SERVER_MISMATCH'
  | 'WATCH_HYSTERESIS_PENDING'
  | 'DOWNGRADE_STABILITY_PENDING';

export interface SiteIdentity {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
}

export interface MonitoringPointIdentity {
  readonly id: string;
  readonly name: string;
  readonly locationDescription: string | null;
  readonly isActive: boolean;
}

export interface MonitoringOverviewItem {
  readonly monitoringPoint: MonitoringPointIdentity;
  readonly site: SiteIdentity;
  readonly device: {
    readonly id: string;
    readonly hardwareId: string;
    readonly displayName: string;
    readonly lifecycleStatus: 'ENABLED' | 'DISABLED';
  } | null;
  readonly latestTelemetry: {
    readonly telemetryId: string;
    readonly deviceTimestamp: string;
    readonly serverReceivedAt: string;
    readonly tiltMagnitudeDeg: number;
    readonly soilMoisturePct: number;
    readonly rainfallMmHour: number;
    readonly batteryVoltage: number;
  } | null;
  readonly currentState: {
    readonly monitoringPointId: string;
    readonly deviceId: string | null;
    readonly serverRisk: RiskLevel;
    readonly connectivityStatus: ConnectivityStatus;
    readonly reasons: readonly RiskReason[];
    readonly latestTelemetryId: string | null;
    readonly evaluatedAt: string;
    readonly lastTelemetryAt: string | null;
    readonly profileId: string | null;
    readonly profileVersion: number | null;
    readonly activeAlertSummary: {
      readonly count: number;
      readonly highestSeverity: AlertSeverity | null;
      readonly types: readonly AlertType[];
    };
  };
}

export type MonitoringOverviewSort =
  'name:asc' | 'name:desc' | 'risk:desc' | 'connectivity:desc' | 'lastTelemetryAt:desc';

export interface MonitoringOverviewQuery extends CursorQuery {
  readonly siteId?: string;
  readonly riskLevel?: RiskLevel;
  readonly connectivityStatus?: ConnectivityStatus;
  readonly search?: string;
  readonly sort?: MonitoringOverviewSort;
}

export interface RiskAssessment {
  readonly id: string;
  readonly telemetryId: string;
  readonly monitoringPointId: string;
  readonly deviceId: string;
  readonly serverRisk: RiskLevel;
  readonly reasons: readonly RiskReason[];
  readonly firmwareRisk: RiskLevel;
  readonly firmwareSirenActive: boolean;
  readonly affectsCurrentState: boolean;
  readonly evaluatedAt: string;
  readonly profileId: string;
  readonly profileVersion: number;
}

export interface Alert {
  readonly id: string;
  readonly organizationId: string;
  readonly site: SiteIdentity;
  readonly monitoringPoint: MonitoringPointIdentity;
  readonly deviceId: string | null;
  readonly type: AlertType;
  readonly severity: AlertSeverity;
  readonly status: AlertStatus;
  readonly reasons: readonly RiskReason[];
  readonly occurrenceCount: number;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AlertSort = 'lastObservedAt:desc' | 'createdAt:desc' | 'severity:desc';

export interface AlertListQuery extends CursorQuery {
  readonly siteId?: string;
  readonly monitoringPointId?: string;
  readonly type?: AlertType;
  readonly severity?: AlertSeverity;
  readonly status?: AlertStatus;
  readonly sort?: AlertSort;
}

export interface TechnicalRange {
  readonly minimum: number;
  readonly maximum: number | null;
}

export interface RiskProfileConfiguration {
  readonly calibrationStatus: CalibrationStatus;
  readonly thresholds: {
    readonly safe: {
      readonly tiltMagnitudeDegLt: number;
      readonly soilMoisturePctLt: number;
      readonly rainfallMmHourLt: number;
    };
    readonly danger: {
      readonly tiltMagnitudeDegGt: number;
      readonly rainfallMmHourGt: number;
      readonly soilMoisturePctGt: number;
    };
  };
  readonly technicalRanges: {
    readonly tiltXDeg: TechnicalRange;
    readonly tiltYDeg: TechnicalRange;
    readonly tiltMagnitudeDeg: TechnicalRange;
    readonly soilMoisturePct: TechnicalRange;
    readonly rainfallMmHour: TechnicalRange;
    readonly batteryVoltage: TechnicalRange;
    readonly signalRssi: TechnicalRange;
  };
  readonly freshness: {
    readonly onlineWithinMinutes: number;
    readonly offlineAfterMinutes: number;
  };
  readonly hysteresis: {
    readonly watchConsecutiveSamples: number;
    readonly dangerConsecutiveSamples: number;
    readonly downgradeStableMinutes: number;
    readonly mismatchConsecutiveSamples: number;
  };
  readonly notes: string | null;
}

export interface RiskProfile extends RiskProfileConfiguration {
  readonly id: string;
  readonly siteId: string;
  readonly version: number;
  readonly createdAt: string;
  readonly activatedAt: string;
}

export type UpdateRiskProfileInput = RiskProfileConfiguration;
