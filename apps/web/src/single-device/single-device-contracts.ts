export type RiskStatus = 'SAFE' | 'WATCH' | 'DANGER' | 'UNKNOWN';
export type SensorHealth = 'READABLE' | 'UNREADABLE' | 'UNKNOWN';
export type Connectivity = 'ONLINE' | 'DELAYED' | 'OFFLINE' | 'UNKNOWN';

export interface SeriesPoint {
  readonly timestamp: string;
  readonly value: number | null;
}
export interface Overview {
  readonly data: {
    readonly generatedAt: string;
    readonly configured: boolean;
    readonly risk: {
      readonly status: RiskStatus;
      readonly reasons: readonly string[];
      readonly observedAt: string | null;
      readonly freshness: string;
    };
    readonly readings: Record<
      'tiltMagnitudeDeg' | 'soilMoisturePct' | 'rainfallMmHour',
      number | null
    >;
    readonly series: Record<
      'tiltMagnitudeDeg' | 'soilMoisturePct' | 'rainfallMmHour',
      readonly SeriesPoint[]
    >;
    readonly range: { readonly from: string; readonly to: string };
  };
}
export interface Diagnostics {
  readonly data: {
    readonly configured: boolean;
    readonly hardwareId: string | null;
    readonly displayName: string | null;
    readonly firmwareVersion: string | null;
    readonly connectivity: Connectivity;
    readonly lastSeenAt: string | null;
    readonly lastTelemetryAt: string | null;
    readonly network: { readonly type: string; readonly signalRssi: number | null } | null;
    readonly batteryVoltage: number | null;
    readonly sensors: Record<'tilt' | 'soilMoisture' | 'rainfall', SensorHealth>;
  };
}
export interface Threshold {
  readonly watch: number;
  readonly danger: number;
}
export interface Profile {
  readonly version: number;
  readonly calibrationStatus: string;
  readonly activatedAt: string;
  readonly notes: string | null;
  readonly tiltMagnitudeDeg: Threshold;
  readonly soilMoisturePct: Threshold;
  readonly rainfallMmHour: Threshold;
}
export interface ProfileResponse {
  readonly data: Profile;
}
export interface ProfileMutationResponse {
  readonly data: { readonly changed: boolean; readonly profile: Profile };
}
export interface AuditResponse {
  readonly data: readonly {
    readonly id: string;
    readonly previousStatus: RiskStatus;
    readonly currentStatus: RiskStatus;
    readonly reasons: readonly string[];
    readonly sensorSnapshot: Record<
      'tiltMagnitudeDeg' | 'soilMoisturePct' | 'rainfallMmHour',
      number | null
    >;
    readonly riskProfile: { readonly id: string | null; readonly version: number | null };
    readonly telemetryId: string | null;
    readonly occurredAt: string;
  }[];
  readonly page: { readonly hasMore: boolean; readonly nextCursor: string | null };
}
export const riskLabel: Record<RiskStatus, string> = {
  SAFE: 'AMAN',
  WATCH: 'WASPADA',
  DANGER: 'BAHAYA',
  UNKNOWN: 'TIDAK DIKETAHUI',
};

const riskReasons: Readonly<Record<string, string>> = {
  DANGER_TILT: 'Kemiringan mencapai ambang bahaya',
  DANGER_SOIL_MOISTURE: 'Kelembapan tanah mencapai ambang bahaya',
  DANGER_RAINFALL: 'Curah hujan mencapai ambang bahaya',
  DANGER_RAIN_MOISTURE: 'Kombinasi hujan dan kelembapan terdeteksi',
  WATCH_TILT: 'Kemiringan mencapai ambang waspada',
  WATCH_SOIL_MOISTURE: 'Kelembapan tanah mencapai ambang waspada',
  WATCH_RAINFALL: 'Curah hujan mencapai ambang waspada',
  STALE_TELEMETRY: 'Data telemetri tidak segar',
  DEVICE_OFFLINE: 'Perangkat tidak terhubung',
  REQUIRED_SENSOR_UNAVAILABLE: 'Sensor bahaya wajib tidak tersedia',
};

export function riskReasonLabel(reason: string): string {
  return riskReasons[reason] ?? reason.replaceAll('_', ' ');
}
export function chartSegments(points: readonly SeriesPoint[]): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];
  for (const point of points) {
    if (point.value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else current.push(point.value);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}
