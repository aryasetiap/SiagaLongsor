import type {
  EvaluateRiskInput,
  RiskEngineProfile,
  RiskEngineResult,
  RiskEngineState,
  RiskReason,
  ServerRisk,
} from './risk-engine.types.js';

export function evaluateRisk(input: EvaluateRiskInput): RiskEngineResult {
  const candidate = classify(input);
  const contextChanged =
    input.previous === null ||
    input.previous.deviceId !== input.deviceId ||
    input.previous.profileId !== input.profile?.id ||
    input.previous.profileVersion !== input.profile?.version;
  const baseline = contextChanged ? null : input.previous;

  if (!input.affectsCurrentState) {
    return result(candidate.risk, candidate.risk, candidate.reasons, input, null, 0);
  }

  const effectiveRisk = candidate.risk;
  const reasons = [...candidate.reasons];
  const watchCount = candidate.risk === 'WATCH' ? (baseline?.watchCount ?? 0) + 1 : 0;
  const dangerCount = candidate.risk === 'DANGER' ? (baseline?.dangerCount ?? 0) + 1 : 0;
  const pendingDowngradeRisk: ServerRisk | null = null;
  const pendingDowngradeSince: Date | null = null;

  // R2 final-product path intentionally applies direct boundary semantics; legacy fields remain persisted for compatibility.

  const mismatch = input.telemetry.firmwareRisk !== effectiveRisk;
  const mismatchCount = mismatch ? (baseline?.mismatchCount ?? 0) + 1 : 0;
  if (mismatch) reasons.push('DEVICE_SERVER_MISMATCH');

  const nextState: RiskEngineState = {
    deviceId: input.deviceId,
    profileId: input.profile?.id ?? null,
    profileVersion: input.profile?.version ?? null,
    serverRisk: effectiveRisk,
    connectivity: connectivityFor(candidate.reasons),
    watchCount,
    dangerCount,
    mismatchCount,
    pendingDowngradeRisk,
    pendingDowngradeSince,
  };
  return {
    candidateRisk: candidate.risk,
    effectiveServerRisk: effectiveRisk,
    assessmentRisk: effectiveRisk,
    connectivity: nextState.connectivity,
    reasons,
    affectsCurrentState: true,
    nextState,
    mismatchThresholdReached:
      mismatch && mismatchCount >= (input.profile?.mismatchConsecutiveSamples ?? 1),
    firmwareMismatch: mismatch,
    currentProjectionShouldChange: true,
  };
}

function classify(input: EvaluateRiskInput): {
  risk: ServerRisk;
  reasons: RiskReason[];
} {
  if (!input.deviceEnabled) return { risk: 'UNKNOWN', reasons: ['DEVICE_DISABLED'] };
  if (!input.timestampTrusted) return { risk: 'UNKNOWN', reasons: ['TIMESTAMP_UNTRUSTED'] };
  if (input.profile === null) return { risk: 'UNKNOWN', reasons: ['PROFILE_UNAVAILABLE'] };
  if (input.liveConnectivity === 'OFFLINE') {
    return { risk: 'UNKNOWN', reasons: ['DEVICE_OFFLINE'] };
  }
  if (input.liveConnectivity === 'DELAYED') {
    return { risk: 'UNKNOWN', reasons: ['TELEMETRY_DELAYED'] };
  }

  const { tiltMagnitudeDeg, soilMoisturePct, rainfallMmHour } = input.telemetry;
  if (tiltMagnitudeDeg === null || soilMoisturePct === null || rainfallMmHour === null) {
    return { risk: 'UNKNOWN', reasons: ['REQUIRED_SENSOR_MISSING'] };
  }
  if (!sensorsValid(input.profile, tiltMagnitudeDeg, soilMoisturePct, rainfallMmHour)) {
    return { risk: 'UNKNOWN', reasons: ['REQUIRED_SENSOR_INVALID'] };
  }

  const dangerReasons: RiskReason[] = [];
  if (tiltMagnitudeDeg >= input.profile.danger.tiltMagnitudeDegGt) {
    dangerReasons.push('DANGER_TILT');
  }
  if (rainfallMmHour >= input.profile.danger.rainfallMmHourGt) {
    dangerReasons.push('DANGER_RAINFALL');
  }
  if (
    (input.rainfallHistory?.consecutiveModerateDays ?? 0) >=
      input.profile.rainfallDuration.consecutiveDays &&
    rainfallMmHour > input.profile.rainfallDuration.continuationRainfallMmHourGt
  ) {
    dangerReasons.push('DANGER_PROLONGED_RAINFALL');
  }
  if (soilMoisturePct >= input.profile.danger.soilMoisturePctGt)
    dangerReasons.push('DANGER_SOIL_MOISTURE');
  if (dangerReasons.length > 0) return { risk: 'DANGER', reasons: dangerReasons };

  if (
    tiltMagnitudeDeg < input.profile.safe.tiltMagnitudeDegLt &&
    soilMoisturePct < input.profile.safe.soilMoisturePctLt &&
    rainfallMmHour < input.profile.safe.rainfallMmHourLt
  ) {
    return { risk: 'SAFE', reasons: ['SAFE_THRESHOLDS_MET'] };
  }
  return { risk: 'WATCH', reasons: ['WATCH_THRESHOLDS_MET'] };
}

function sensorsValid(
  profile: RiskEngineProfile,
  tilt: number,
  moisture: number,
  rainfall: number,
): boolean {
  return (
    inRange(tilt, profile.ranges.tiltMagnitudeDeg) &&
    inRange(moisture, profile.ranges.soilMoisturePct) &&
    inRange(rainfall, profile.ranges.rainfallMmHour)
  );
}

function inRange(value: number, range: readonly [number, number | null]): boolean {
  return Number.isFinite(value) && value >= range[0] && (range[1] === null || value <= range[1]);
}

function connectivityFor(reasons: readonly RiskReason[]) {
  if (reasons.includes('DEVICE_DISABLED')) return 'UNKNOWN' as const;
  if (reasons.includes('DEVICE_OFFLINE')) return 'OFFLINE' as const;
  if (reasons.includes('TELEMETRY_DELAYED')) return 'DELAYED' as const;
  return 'ONLINE' as const;
}

function result(
  candidateRisk: ServerRisk,
  effectiveRisk: ServerRisk,
  reasons: RiskReason[],
  input: EvaluateRiskInput,
  nextState: RiskEngineState | null,
  mismatchCount: number,
): RiskEngineResult {
  const mismatch = input.telemetry.firmwareRisk !== effectiveRisk;
  return {
    candidateRisk,
    effectiveServerRisk: effectiveRisk,
    assessmentRisk: effectiveRisk,
    connectivity: input.previous?.connectivity ?? 'UNKNOWN',
    reasons: mismatch ? [...reasons, 'DEVICE_SERVER_MISMATCH'] : reasons,
    affectsCurrentState: false,
    nextState,
    mismatchThresholdReached:
      mismatch && mismatchCount >= (input.profile?.mismatchConsecutiveSamples ?? 1),
    firmwareMismatch: mismatch,
    currentProjectionShouldChange: false,
  };
}
