import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  ConnectivityStatus,
  DeviceLifecycleStatus,
  FirmwareRiskLevel,
  RiskLevel,
} from '../generated/prisma/enums.js';
import type { RiskReason } from './risk-engine.types.js';

export interface PageInfo {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

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

export interface AlertData {
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

export interface AlertListResponse {
  readonly data: readonly AlertData[];
  readonly page: PageInfo;
}

export interface AlertResponse {
  readonly data: AlertData;
}

export interface RiskAssessmentData {
  readonly id: string;
  readonly telemetryId: string;
  readonly monitoringPointId: string;
  readonly deviceId: string;
  readonly serverRisk: RiskLevel;
  readonly reasons: readonly RiskReason[];
  readonly firmwareRisk: FirmwareRiskLevel;
  readonly firmwareSirenActive: boolean;
  readonly affectsCurrentState: boolean;
  readonly evaluatedAt: string;
  readonly profileId: string;
  readonly profileVersion: number;
}

export interface RiskAssessmentListResponse {
  readonly data: readonly RiskAssessmentData[];
  readonly page: PageInfo;
}

export interface MonitoringOverviewItem {
  readonly monitoringPoint: MonitoringPointIdentity;
  readonly site: SiteIdentity;
  readonly device: {
    readonly id: string;
    readonly hardwareId: string;
    readonly displayName: string;
    readonly lifecycleStatus: DeviceLifecycleStatus;
  } | null;
  readonly latestTelemetry: {
    readonly telemetryId: string;
    readonly deviceTimestamp: string;
    readonly serverReceivedAt: string;
    readonly tiltMagnitudeDeg: number | null;
    readonly soilMoisturePct: number | null;
    readonly rainfallMmHour: number | null;
    readonly batteryVoltage: number | null;
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

export interface MonitoringOverviewResponse {
  readonly data: readonly MonitoringOverviewItem[];
  readonly page: PageInfo;
}
