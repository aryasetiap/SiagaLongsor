export type RiskStatus = 'SAFE' | 'WATCH' | 'WARNING' | 'DANGER' | 'UNKNOWN';
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
    readonly thresholds: Record<
      'tiltMagnitudeDeg' | 'soilMoisturePct' | 'rainfallMmHour',
      Threshold
    > | null;
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
  readonly rainfallDuration: {
    readonly moderateDailyMinMm: number;
    readonly moderateDailyMaxMm: number;
    readonly consecutiveDays: number;
    readonly continuationRainfallMmHourGt: number;
  };
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
  WARNING: 'SIAGA',
  DANGER: 'AWAS',
  UNKNOWN: 'TIDAK DIKETAHUI',
};

/**
 * The API/database enum names are retained for backward compatibility. Public
 * warning terminology follows the three landslide-warning levels used by BNPB:
 * Waspada (Tingkat 1), Siaga (Tingkat 2), and Awas (Tingkat 3). Aman is
 * intentionally represented outside those warning levels.
 */
export const riskLevelLabel: Record<RiskStatus, string> = {
  SAFE: 'DI LUAR TINGKAT PERINGATAN',
  WATCH: 'TINGKAT 1',
  WARNING: 'TINGKAT 2',
  DANGER: 'TINGKAT 3',
  UNKNOWN: 'STATUS OPERASIONAL',
};

const riskReasons: Readonly<Record<string, string>> = {
  SAFE_THRESHOLDS_MET: 'Seluruh pembacaan valid berada di bawah ambang Waspada',
  WATCH_THRESHOLDS_MET: 'Satu atau lebih pembacaan mencapai ambang Waspada (Tingkat 1)',
  WARNING_TILT: 'Kemiringan mencapai ambang Siaga (Tingkat 2)',
  WARNING_SOIL_MOISTURE: 'Kelembapan tanah mencapai ambang Siaga (Tingkat 2)',
  WARNING_RAINFALL: 'Curah hujan mencapai ambang Siaga (Tingkat 2)',
  DANGER_RAIN_TILT: 'Kombinasi kemiringan dan curah hujan mencapai tingkat Awas',
  DANGER_TILT: 'Kemiringan mencapai ambang Awas (Tingkat 3)',
  DANGER_SOIL_MOISTURE: 'Kelembapan tanah mencapai ambang Awas (Tingkat 3)',
  DANGER_RAINFALL: 'Curah hujan mencapai ambang Awas (Tingkat 3)',
  DANGER_PROLONGED_RAINFALL:
    'Hujan berlanjut setelah beberapa hari hujan sedang dan memicu tingkat Awas',
  DANGER_RAIN_MOISTURE: 'Kombinasi hujan dan kelembapan mencapai tingkat Awas',
  WATCH_TILT: 'Kemiringan mencapai ambang Waspada (Tingkat 1)',
  WATCH_SOIL_MOISTURE: 'Kelembapan tanah mencapai ambang Waspada (Tingkat 1)',
  WATCH_RAINFALL: 'Curah hujan mencapai ambang Waspada (Tingkat 1)',
  REQUIRED_SENSOR_MISSING: 'Pembacaan sensor wajib tidak tersedia',
  REQUIRED_SENSOR_INVALID: 'Pembacaan sensor wajib berada di luar rentang teknis',
  DEVICE_DISABLED: 'Perangkat dinonaktifkan',
  TELEMETRY_DELAYED: 'Telemetri terlambat diterima',
  DEVICE_OFFLINE: 'Perangkat tidak terhubung',
  TIMESTAMP_UNTRUSTED: 'Waktu perangkat tidak dapat dipercaya',
  PROFILE_UNAVAILABLE: 'Profil risiko aktif tidak tersedia',
  DEVICE_SERVER_MISMATCH: 'Status firmware berbeda dengan perhitungan server',
  WATCH_HYSTERESIS_PENDING: 'Konfirmasi kondisi Siaga masih berlangsung',
  DOWNGRADE_STABILITY_PENDING: 'Stabilitas penurunan tingkat masih dipantau',
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
