import type { FirmwareRisk } from './risk-engine.types.js';

export function firmwareRiskFromRawPayload(rawPayload: unknown): FirmwareRisk | null {
  if (!isRecord(rawPayload) || !isRecord(rawPayload.deviceAssessment)) return null;

  const { riskLevel, sirenActive } = rawPayload.deviceAssessment;
  return typeof sirenActive === 'boolean' && isFirmwareRisk(riskLevel) ? riskLevel : null;
}

function isFirmwareRisk(value: unknown): value is FirmwareRisk {
  return value === 'SAFE' || value === 'WATCH' || value === 'DANGER' || value === 'UNKNOWN';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
