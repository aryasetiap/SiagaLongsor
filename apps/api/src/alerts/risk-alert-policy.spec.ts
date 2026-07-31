import { describe, expect, it } from 'vitest';

import { AlertType } from '../generated/prisma/enums.js';
import { riskAlertTypes } from './risk-alert-policy.js';

describe('riskAlertTypes', () => {
  it('creates WATCH only after the engine makes WATCH effective', () => {
    expect(
      riskAlertTypes({
        affectsCurrentState: true,
        effectiveServerRisk: 'WATCH',
        mismatchThresholdReached: false,
      }),
    ).toEqual([AlertType.RISK_WATCH]);
  });

  it('creates DANGER independently from WATCH', () => {
    expect(
      riskAlertTypes({
        affectsCurrentState: true,
        effectiveServerRisk: 'DANGER',
        mismatchThresholdReached: false,
      }),
    ).toEqual([AlertType.RISK_DANGER]);
  });

  it('does not create an alert before mismatch threshold', () => {
    expect(
      riskAlertTypes({
        affectsCurrentState: true,
        effectiveServerRisk: 'SAFE',
        mismatchThresholdReached: false,
      }),
    ).toEqual([]);
  });

  it('creates a mismatch alert at threshold', () => {
    expect(
      riskAlertTypes({
        affectsCurrentState: true,
        effectiveServerRisk: 'SAFE',
        mismatchThresholdReached: true,
      }),
    ).toEqual([AlertType.DEVICE_SERVER_MISMATCH]);
  });

  it('never creates alerts from late telemetry', () => {
    expect(
      riskAlertTypes({
        affectsCurrentState: false,
        effectiveServerRisk: 'DANGER',
        mismatchThresholdReached: true,
      }),
    ).toEqual([]);
  });
});
