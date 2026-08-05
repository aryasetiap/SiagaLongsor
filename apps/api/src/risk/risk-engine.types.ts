export type ServerRisk = 'SAFE' | 'WATCH' | 'DANGER' | 'UNKNOWN';
export type Connectivity = 'ONLINE' | 'DELAYED' | 'OFFLINE' | 'UNKNOWN';

export type RiskReason =
  | 'SAFE_THRESHOLDS_MET'
  | 'WATCH_THRESHOLDS_MET'
  | 'DANGER_TILT'
  | 'DANGER_RAIN_MOISTURE'
  | 'DANGER_RAINFALL'
  | 'DANGER_SOIL_MOISTURE'
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

export interface RiskEngineProfile {
  readonly id: string;
  readonly version: number;
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
  readonly ranges: {
    readonly tiltMagnitudeDeg: readonly [number, number | null];
    readonly soilMoisturePct: readonly [number, number | null];
    readonly rainfallMmHour: readonly [number, number | null];
  };
  readonly watchConsecutiveSamples: number;
  readonly dangerConsecutiveSamples: number;
  readonly downgradeStableMinutes: number;
  readonly mismatchConsecutiveSamples: number;
}

export interface RiskEngineState {
  readonly deviceId: string | null;
  readonly profileId: string | null;
  readonly profileVersion: number | null;
  readonly serverRisk: ServerRisk;
  readonly connectivity: Connectivity;
  readonly watchCount: number;
  readonly dangerCount: number;
  readonly mismatchCount: number;
  readonly pendingDowngradeRisk: ServerRisk | null;
  readonly pendingDowngradeSince: Date | null;
}

export interface EvaluateRiskInput {
  readonly profile: RiskEngineProfile | null;
  readonly deviceId: string;
  readonly deviceEnabled: boolean;
  readonly timestampTrusted: boolean;
  readonly liveConnectivity?: Connectivity;
  readonly affectsCurrentState: boolean;
  readonly evaluatedAt: Date;
  readonly telemetry: {
    readonly tiltMagnitudeDeg: number | null;
    readonly soilMoisturePct: number | null;
    readonly rainfallMmHour: number | null;
    readonly firmwareRisk: ServerRisk;
  };
  readonly previous: RiskEngineState | null;
}

export interface RiskEngineResult {
  readonly candidateRisk: ServerRisk;
  readonly effectiveServerRisk: ServerRisk;
  readonly assessmentRisk: ServerRisk;
  readonly connectivity: Connectivity;
  readonly reasons: readonly RiskReason[];
  readonly affectsCurrentState: boolean;
  readonly nextState: RiskEngineState | null;
  readonly mismatchThresholdReached: boolean;
  readonly firmwareMismatch: boolean;
  readonly currentProjectionShouldChange: boolean;
}
