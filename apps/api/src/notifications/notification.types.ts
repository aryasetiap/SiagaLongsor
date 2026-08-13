import type { ServerRisk } from '../risk/risk-engine.types.js';

export interface RiskTransitionNotificationPayload {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly previousStatus: ServerRisk;
  readonly currentStatus: ServerRisk;
  readonly reasons: readonly string[];
  readonly occurredAt: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly siteTimezone: string;
  readonly monitoringPointId: string;
  readonly monitoringPointName: string;
  readonly telemetryId: string | null;
  readonly sensorSnapshot: {
    readonly tiltMagnitudeDeg: number | null;
    readonly soilMoisturePct: number | null;
    readonly rainfallMmHour: number | null;
  };
  readonly rainfallDuration: {
    readonly consecutiveModerateDays: number;
    readonly previousDailyTotalsMm: readonly number[];
  } | null;
}

export type TelegramDeliveryResult =
  | { readonly delivered: true; readonly messageId: string }
  | {
      readonly delivered: false;
      readonly retryable: boolean;
      readonly code: string;
      readonly message: string;
      readonly retryAfterSeconds: number | null;
    };

export function parseRiskTransitionPayload(
  value: unknown,
): RiskTransitionNotificationPayload | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (
    !isString(value.eventId) ||
    !isRisk(value.previousStatus) ||
    !isRisk(value.currentStatus) ||
    !isStringArray(value.reasons) ||
    !isString(value.occurredAt) ||
    !isString(value.organizationId) ||
    !isString(value.siteId) ||
    !isString(value.siteName) ||
    !isString(value.siteTimezone) ||
    !isString(value.monitoringPointId) ||
    !isString(value.monitoringPointName) ||
    !(value.telemetryId === null || isString(value.telemetryId)) ||
    !isSensorSnapshot(value.sensorSnapshot) ||
    !isRainfallDuration(value.rainfallDuration)
  ) {
    return null;
  }
  return value as unknown as RiskTransitionNotificationPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRisk(value: unknown): value is ServerRisk {
  return value === 'SAFE' || value === 'WATCH' || value === 'DANGER' || value === 'UNKNOWN';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isSensorSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNullableFiniteNumber(value.tiltMagnitudeDeg) &&
    isNullableFiniteNumber(value.soilMoisturePct) &&
    isNullableFiniteNumber(value.rainfallMmHour)
  );
}

function isRainfallDuration(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value.consecutiveModerateDays === 'number' &&
      Number.isInteger(value.consecutiveModerateDays) &&
      value.consecutiveModerateDays >= 0 &&
      Array.isArray(value.previousDailyTotalsMm) &&
      value.previousDailyTotalsMm.every(
        (item) => typeof item === 'number' && Number.isFinite(item),
      ))
  );
}
