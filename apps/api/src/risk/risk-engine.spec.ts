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
  safe: {
    tiltMagnitudeDegLt: 3,
    soilMoisturePctLt: 65,
    rainfallMmHourLt: 20,
  },
  danger: {
    tiltMagnitudeDegGt: 8,
    rainfallMmHourGt: 50,
    soilMoisturePctGt: 85,
  },
  rainfallDuration: {
    moderateDailyMinMm: 30,
    moderateDailyMaxMm: 50,
    consecutiveDays: 3,
    continuationRainfallMmHourGt: 0,
  },
  ranges: {
    tiltMagnitudeDeg: [0, 180],
    soilMoisturePct: [0, 100],
    rainfallMmHour: [0, 1000],
  },

  // Retained in persistence for legacy compatibility.
  // R2 direct-boundary semantics do not use these values to delay hazard changes.
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

describe('evaluateRisk - R2 direct boundary semantics', () => {
  it('returns SAFE when all required hazard readings are below WATCH thresholds', () => {
    const result = evaluateRisk(input());

    expect(result.assessmentRisk).toBe('SAFE');
    expect(result.reasons).toContain('SAFE_THRESHOLDS_MET');
  });

  it.each([
    ['tilt', 3, 40, 5],
    ['soil moisture', 1, 65, 5],
    ['rainfall', 1, 40, 20],
  ] as const)('returns WATCH at the exact %s WATCH boundary', (_name, tilt, moisture, rainfall) => {
    const result = evaluateRisk(
      input({
        telemetry: {
          tiltMagnitudeDeg: tilt,
          soilMoisturePct: moisture,
          rainfallMmHour: rainfall,
          firmwareRisk: 'WATCH',
        },
      }),
    );

    expect(result.assessmentRisk).toBe('WATCH');
    expect(result.reasons).toContain('WATCH_THRESHOLDS_MET');
  });

  it('does not require consecutive WATCH samples in R2', () => {
    const result = evaluateRisk(
      input({
        telemetry: {
          tiltMagnitudeDeg: 4,
          soilMoisturePct: 40,
          rainfallMmHour: 5,
          firmwareRisk: 'WATCH',
        },
      }),
    );

    expect(result.assessmentRisk).toBe('WATCH');
    expect(result.reasons).not.toContain('WATCH_HYSTERESIS_PENDING');
  });

  it.each([
    ['tilt', 8, 40, 5, 'WARNING_TILT'],
    ['soil moisture', 1, 85, 5, 'WARNING_SOIL_MOISTURE'],
    ['rainfall', 1, 40, 50, 'WARNING_RAINFALL'],
  ] as const)(
    'returns WARNING when %s reaches its exact SIAGA boundary',
    (_name, tilt, moisture, rainfall, reason) => {
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

      expect(result.assessmentRisk).toBe('WARNING');
      expect(result.reasons).toContain(reason);
    },
  );

  it('classifies high tilt alone as WARNING (Siaga)', () => {
    const result = evaluateRisk(
      input({
        telemetry: {
          tiltMagnitudeDeg: 9,
          soilMoisturePct: 40,
          rainfallMmHour: 5,
          firmwareRisk: 'UNKNOWN',
        },
      }),
    );

    expect(result.assessmentRisk).toBe('WARNING');
    expect(result.reasons).toContain('WARNING_TILT');
  });

  it('classifies high soil moisture alone as WARNING (Siaga)', () => {
    const result = evaluateRisk(
      input({
        telemetry: {
          tiltMagnitudeDeg: 1,
          soilMoisturePct: 90,
          rainfallMmHour: 5,
          firmwareRisk: 'UNKNOWN',
        },
      }),
    );

    expect(result.assessmentRisk).toBe('WARNING');
    expect(result.reasons).toContain('WARNING_SOIL_MOISTURE');
  });

  it('classifies high rainfall alone as WARNING (Siaga)', () => {
    const result = evaluateRisk(
      input({
        telemetry: {
          tiltMagnitudeDeg: 1,
          soilMoisturePct: 40,
          rainfallMmHour: 60,
          firmwareRisk: 'UNKNOWN',
        },
      }),
    );

    expect(result.assessmentRisk).toBe('WARNING');
    expect(result.reasons).toContain('WARNING_RAINFALL');
  });

  it('returns DANGER (Awas) for the high-tilt and high-rainfall combination', () => {
    const result = evaluateRisk(
      input({
        telemetry: {
          tiltMagnitudeDeg: 8,
          soilMoisturePct: 40,
          rainfallMmHour: 50,
          firmwareRisk: 'DANGER',
        },
      }),
    );

    expect(result.assessmentRisk).toBe('DANGER');
    expect(result.reasons).toContain('DANGER_RAIN_TILT');
  });

  it('returns DANGER when rain continues after three consecutive moderate-rain days', () => {
    const result = evaluateRisk(
      input({
        rainfallHistory: {
          consecutiveModerateDays: 3,
          previousDailyTotalsMm: [40, 35, 45],
        },
        telemetry: {
          tiltMagnitudeDeg: 1,
          soilMoisturePct: 40,
          rainfallMmHour: 0.1,
          firmwareRisk: 'DANGER',
        },
      }),
    );

    expect(result.assessmentRisk).toBe('DANGER');
    expect(result.reasons).toContain('DANGER_PROLONGED_RAINFALL');
  });

  it.each([
    ['the fourth day is dry', 3, 0],
    ['only two previous days were moderate', 2, 0.1],
  ] as const)(
    'does not apply prolonged-rain danger when %s',
    (_name, consecutiveModerateDays, rainfallMmHour) => {
      const result = evaluateRisk(
        input({
          rainfallHistory: {
            consecutiveModerateDays,
            previousDailyTotalsMm: [40, 35, 45],
          },
          telemetry: {
            tiltMagnitudeDeg: 1,
            soilMoisturePct: 40,
            rainfallMmHour,
            firmwareRisk: 'SAFE',
          },
        }),
      );

      expect(result.assessmentRisk).not.toBe('DANGER');
      expect(result.reasons).not.toContain('DANGER_PROLONGED_RAINFALL');
    },
  );

  it('collects independent WARNING reasons when multiple Siaga thresholds are reached', () => {
    const result = evaluateRisk(
      input({
        telemetry: {
          tiltMagnitudeDeg: 9,
          soilMoisturePct: 90,
          rainfallMmHour: 20,
          firmwareRisk: 'UNKNOWN',
        },
      }),
    );

    expect(result.candidateRisk).toBe('WARNING');
    expect(result.reasons).toEqual(
      expect.arrayContaining(['WARNING_TILT', 'WARNING_SOIL_MOISTURE']),
    );
  });

  it.each([
    ['tilt', null, 40, 5],
    ['soil moisture', 1, null, 5],
    ['rainfall', 1, 40, null],
  ] as const)(
    'returns UNKNOWN when required %s reading is unavailable',
    (_name, tilt, moisture, rainfall) => {
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
      expect(result.reasons).toContain('REQUIRED_SENSOR_MISSING');
    },
  );

  it.each([
    ['negative rainfall', 1, 40, -1],
    ['moisture above range', 1, 101, 5],
    ['tilt above range', 181, 40, 5],
  ] as const)('returns UNKNOWN for invalid %s', (_name, tilt, moisture, rainfall) => {
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
    expect(result.reasons).toContain('REQUIRED_SENSOR_INVALID');
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

  it.each([
    ['DELAYED', 'TELEMETRY_DELAYED'],
    ['OFFLINE', 'DEVICE_OFFLINE'],
  ] as const)('never reports SAFE for %s live connectivity', (connectivity, reason) => {
    const result = evaluateRisk(
      input({
        liveConnectivity: connectivity,
      }),
    );

    expect(result.effectiveServerRisk).toBe('UNKNOWN');
    expect(result.reasons).toContain(reason);
  });

  it('upgrades to DANGER immediately', () => {
    const result = evaluateRisk(
      input({
        previous: state('SAFE'),
        telemetry: {
          tiltMagnitudeDeg: 9,
          soilMoisturePct: 40,
          rainfallMmHour: 60,
          firmwareRisk: 'DANGER',
        },
      }),
    );

    expect(result.assessmentRisk).toBe('DANGER');
  });

  it('downgrades immediately when current valid readings classify SAFE', () => {
    const result = evaluateRisk(
      input({
        previous: state('DANGER'),
        telemetry: {
          tiltMagnitudeDeg: 1,
          soilMoisturePct: 40,
          rainfallMmHour: 5,
          firmwareRisk: 'SAFE',
        },
      }),
    );

    expect(result.assessmentRisk).toBe('SAFE');
    expect(result.reasons).not.toContain('DOWNGRADE_STABILITY_PENDING');
  });

  it('does not mutate current projection for late telemetry', () => {
    const previous = state('SAFE');

    const result = evaluateRisk(
      input({
        affectsCurrentState: false,
        previous,
        telemetry: {
          tiltMagnitudeDeg: 9,
          soilMoisturePct: 40,
          rainfallMmHour: 60,
          firmwareRisk: 'DANGER',
        },
      }),
    );

    expect(result.assessmentRisk).toBe('DANGER');
    expect(result.nextState).toBeNull();
    expect(result.affectsCurrentState).toBe(false);
  });

  it('uses direct WATCH semantics after device or profile context changes', () => {
    for (const previous of [
      state('WATCH', {
        deviceId: 'old-device',
        watchCount: 8,
      }),
      state('WATCH', {
        profileVersion: 99,
        watchCount: 8,
      }),
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

      expect(result.assessmentRisk).toBe('WATCH');
      expect(result.nextState?.watchCount).toBe(1);
    }
  });

  it('tracks firmware mismatch consecutively and resets on agreement', () => {
    const first = evaluateRisk(
      input({
        previous: state('SAFE'),
        telemetry: {
          ...input().telemetry,
          firmwareRisk: 'WATCH',
        },
      }),
    );

    const second = evaluateRisk(
      input({
        previous: first.nextState,
        telemetry: mismatchedFirmwareTelemetry(),
      }),
    );

    const third = evaluateRisk(
      input({
        previous: second.nextState,
        telemetry: mismatchedFirmwareTelemetry(),
      }),
    );

    expect(first.reasons).toContain('DEVICE_SERVER_MISMATCH');
    expect(second.mismatchThresholdReached).toBe(false);
    expect(third.mismatchThresholdReached).toBe(true);

    const agreed = evaluateRisk(
      input({
        previous: third.nextState,
      }),
    );

    expect(agreed.nextState?.mismatchCount).toBe(0);
  });
});

function mismatchedFirmwareTelemetry() {
  return {
    ...input().telemetry,
    firmwareRisk: 'WATCH' as const,
  };
}
