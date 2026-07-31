import type { CalibrationStatus } from '../generated/prisma/enums.js';

export interface RiskProfileData {
  readonly id: string;
  readonly siteId: string;
  readonly version: number;
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
  readonly technicalRanges: Record<
    | 'tiltXDeg'
    | 'tiltYDeg'
    | 'tiltMagnitudeDeg'
    | 'soilMoisturePct'
    | 'rainfallMmHour'
    | 'batteryVoltage'
    | 'signalRssi',
    { readonly minimum: number; readonly maximum: number | null }
  >;
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
  readonly createdAt: string;
  readonly activatedAt: string;
}

export interface RiskProfileResponse {
  readonly data: RiskProfileData;
}

export interface RiskProfileMutationResponse {
  readonly data: {
    readonly profile: RiskProfileData;
    readonly changed: boolean;
  };
}
