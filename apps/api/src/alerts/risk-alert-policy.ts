import { AlertType } from '../generated/prisma/enums.js';
import type { RiskEngineResult } from '../risk/risk-engine.types.js';

export function riskAlertTypes(
  result: Pick<
    RiskEngineResult,
    'affectsCurrentState' | 'effectiveServerRisk' | 'mismatchThresholdReached'
  >,
): readonly AlertType[] {
  if (!result.affectsCurrentState) return [];
  const types: AlertType[] = [];
  if (result.effectiveServerRisk === 'WATCH') types.push(AlertType.RISK_WATCH);
  if (result.effectiveServerRisk === 'DANGER') types.push(AlertType.RISK_DANGER);
  if (result.mismatchThresholdReached) types.push(AlertType.DEVICE_SERVER_MISMATCH);
  return types;
}
