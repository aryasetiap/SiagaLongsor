import { describe, expect, it } from 'vitest';

import { evaluateRisk } from './risk-engine.js';
import type {
  EvaluateRiskInput,
  RiskEngineProfile,
  RiskEngineState,
  ServerRisk,
} from './risk-engine.types.js';

const profile: RiskEngineProfile = {
  id: 'profile-1',
  version: 1,
  safe: { tiltMagnitudeDegLt: 3, soilMoisturePctLt: 65, rainfallMmHourLt: 20 },
  danger: {
    tiltMagnitudeDegGt: 8,
    rainfallMmHourGt: 50,
    soilMoisturePctGt: 85,
  },
  ranges: {
    tiltMagnitudeDeg: [0, 180],
    soilMoisturePct: [0, 100],
    rainfallMmHour: [0, 1000],
  },
  watchConsecutiveSamples: 2,
  dangerConsecutiveSamples: 1,
  downgradeStableMinutes: 10,
  mismatchConsecutiveSamples: 3,
};

function input(overrides: Partial<EvaluateRiskInput> = {}): EvaluateRiskInput {
  return {
    profile,
    deviceId: 'device-1',
    deviceEnabled: true,
    timestampTrusted: true,
    affectsCurrentState: true,
    evaluatedAt: new Date('2026-07-31T00:00:00.000Z'),
    telemetry: {
      tiltMagnitudeDeg: 1,
      soilMoisturePct: 40,
      rainfallMmHour: 5,
      firmwareRisk: 'SAFE',
    },
    previous: null,
    ...overrides,
  };
}

function state(risk: ServerRisk, overrides: Partial<RiskEngineState> = {}): RiskEngineState {
  return {
    deviceId: 'device-1',
    profileId: profile.id,
    profileVersion: profile.version,
    serverRisk: risk,
    connectivity: 'ONLINE',
    watchCount: 0,
    dangerCount: 0,
    mismatchCount: 0,
    pendingDowngradeRisk: null,
    pendingDowngradeSince: null,
    ...overrides,
  };
}

describe('evaluateRisk', () => {
  it.each([
    ['SAFE', 1, 40, 5, 'SAFE_THRESHOLDS_MET'],
    ['WATCH', 3, 40, 5, 'WATCH_THRESHOLDS_MET'],
    ['WATCH', 1, 65, 5, 'WATCH_THRESHOLDS_MET'],
    ['WATCH', 1, 70, 5, 'WATCH_THRESHOLDS_MET'],
    ['WATCH', 1, 40, 20, 'WATCH_THRESHOLDS_MET'],
    ['WATCH', 1, 40, 50, 'WATCH_THRESHOLDS_MET'],
    ['WATCH', 1, 40, 51, 'WATCH_THRESHOLDS_MET'],
    ['DANGER', 8.01, 40, 5, 'DANGER_TILT'],
    ['DANGER', 1, 85.01, 50.01, 'DANGER_RAIN_MOISTURE'],
    ['WATCH', 8, 40, 5, 'WATCH_THRESHOLDS_MET'],
    ['WATCH', 1, 85, 50, 'WATCH_THRESHOLDS_MET'],
  ] as const)(
    'classifies %s from tilt=%s moisture=%s rainfall=%s',
    (expected, tilt, moisture, rainfall, reason) => {
      const result = evaluateRisk(
        input({
          affectsCurrentState: false,
          telemetry: {
            tiltMagnitudeDeg: tilt,
            soilMoisturePct: moisture,
            rainfallMmHour: rainfall,
            firmwareRisk: expected,
          },
        }),
      );
      expect(result.assessmentRisk).toBe(expected);
      expect(result.reasons).toContain(reason);
    },
  );

  it.each([
    ['missing sensor', null, 40, 5, 'REQUIRED_SENSOR_MISSING'],
    ['negative rainfall', 1, 40, -1, 'REQUIRED_SENSOR_INVALID'],
    ['moisture above range', 1, 101, 5, 'REQUIRED_SENSOR_INVALID'],
  ] as const)('returns UNKNOWN for %s', (_name, tilt, moisture, rainfall, reason) => {
    const result = evaluateRisk(
      input({
        telemetry: {
          tiltMagnitudeDeg: tilt,
          soilMoisturePct: moisture,
          rainfallMmHour: rainfall,
          firmwareRisk: 'UNKNOWN',
        },
      }),
    );
    expect(result.assessmentRisk).toBe('UNKNOWN');
    expect(result.reasons).toContain(reason);
  });

  it.each([
    [{ deviceEnabled: false }, 'DEVICE_DISABLED'],
    [{ timestampTrusted: false }, 'TIMESTAMP_UNTRUSTED'],
    [{ profile: null }, 'PROFILE_UNAVAILABLE'],
  ] as const)('prioritizes UNKNOWN precondition', (override, reason) => {
    const result = evaluateRisk(input(override));
    expect(result.assessmentRisk).toBe('UNKNOWN');
    expect(result.reasons).toContain(reason);
  });

  it('requires two consecutive WATCH samples', () => {
    const first = evaluateRisk(
      input({
        telemetry: {
          tiltMagnitudeDeg: 4,
          soilMoisturePct: 40,
          rainfallMmHour: 5,
          firmwareRisk: 'WATCH',
        },
      }),
    );
    expect(first.assessmentRisk).toBe('UNKNOWN');
    expect(first.reasons).toContain('WATCH_HYSTERESIS_PENDING');

    const second = evaluateRisk(
      input({
        previous: first.nextState,
        telemetry: {
          tiltMagnitudeDeg: 4,
          soilMoisturePct: 40,
          rainfallMmHour: 5,
          firmwareRisk: 'WATCH',
        },
      }),
    );
    expect(second.assessmentRisk).toBe('WATCH');
  });

  it('upgrades to DANGER immediately', () => {
    const result = evaluateRisk(
      input({
        previous: state('SAFE'),
        telemetry: {
          tiltMagnitudeDeg: 9,
          soilMoisturePct: 40,
          rainfallMmHour: 5,
          firmwareRisk: 'DANGER',
        },
      }),
    );
    expect(result.assessmentRisk).toBe('DANGER');
  });

  it('applies DANGER precedence over otherwise non-safe readings', () => {
    const result = evaluateRisk(
      input({
        telemetry: {
          tiltMagnitudeDeg: 9,
          soilMoisturePct: 90,
          rainfallMmHour: 60,
          firmwareRisk: 'DANGER',
        },
      }),
    );
    expect(result.candidateRisk).toBe('DANGER');
    expect(result.reasons).toEqual(expect.arrayContaining(['DANGER_TILT', 'DANGER_RAIN_MOISTURE']));
  });

  it.each([
    ['DELAYED', 'TELEMETRY_DELAYED'],
    ['OFFLINE', 'DEVICE_OFFLINE'],
  ] as const)('never reports SAFE for %s live connectivity', (connectivity, reason) => {
    const result = evaluateRisk(input({ liveConnectivity: connectivity }));
    expect(result.effectiveServerRisk).toBe('UNKNOWN');
    expect(result.reasons).toContain(reason);
  });

  it('holds a downgrade until stability duration passes', () => {
    const pending = evaluateRisk(
      input({
        previous: state('DANGER'),
        evaluatedAt: new Date('2026-07-31T00:00:00.000Z'),
      }),
    );
    expect(pending.assessmentRisk).toBe('DANGER');
    expect(pending.reasons).toContain('DOWNGRADE_STABILITY_PENDING');
    const stable = evaluateRisk(
      input({
        previous: pending.nextState,
        evaluatedAt: new Date('2026-07-31T00:10:00.000Z'),
      }),
    );
    expect(stable.assessmentRisk).toBe('SAFE');
  });

  it('does not mutate projection or hysteresis for late telemetry', () => {
    const previous = state('SAFE', { watchCount: 1 });
    const result = evaluateRisk(
      input({
        affectsCurrentState: false,
        previous,
        telemetry: {
          tiltMagnitudeDeg: 9,
          soilMoisturePct: 40,
          rainfallMmHour: 5,
          firmwareRisk: 'DANGER',
        },
      }),
    );
    expect(result.assessmentRisk).toBe('DANGER');
    expect(result.nextState).toBeNull();
  });

  it('resets prospective counters when device or profile changes', () => {
    for (const previous of [
      state('WATCH', { deviceId: 'old-device', watchCount: 8 }),
      state('WATCH', { profileVersion: 99, watchCount: 8 }),
    ]) {
      const result = evaluateRisk(
        input({
          previous,
          telemetry: {
            tiltMagnitudeDeg: 4,
            soilMoisturePct: 40,
            rainfallMmHour: 5,
            firmwareRisk: 'WATCH',
          },
        }),
      );
      expect(result.nextState?.watchCount).toBe(1);
      expect(result.assessmentRisk).toBe('UNKNOWN');
    }
  });

  it('tracks firmware mismatch consecutively and resets on agreement', () => {
    const first = evaluateRisk(
      input({
        previous: state('SAFE'),
        telemetry: { ...input().telemetry, firmwareRisk: 'WATCH' },
      }),
    );
    const second = evaluateRisk(
      input({ previous: first.nextState, telemetry: firstInputMismatch() }),
    );
    const third = evaluateRisk(
      input({ previous: second.nextState, telemetry: firstInputMismatch() }),
    );
    expect(first.reasons).toContain('DEVICE_SERVER_MISMATCH');
    expect(second.mismatchThresholdReached).toBe(false);
    expect(third.mismatchThresholdReached).toBe(true);
    const agreed = evaluateRisk(input({ previous: third.nextState }));
    expect(agreed.nextState?.mismatchCount).toBe(0);
  });
});

function firstInputMismatch() {
  return { ...input().telemetry, firmwareRisk: 'WATCH' as const };
}
