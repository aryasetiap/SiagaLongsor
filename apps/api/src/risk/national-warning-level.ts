import type { ServerRisk } from './risk-engine.types.js';

export interface NationalWarningLevel {
  readonly level: 1 | 2 | 3 | null;
  readonly label: 'AMAN' | 'WASPADA' | 'SIAGA' | 'AWAS' | 'TIDAK DIKETAHUI';
  readonly displayLabel: string;
}

/**
 * RiskLevel values are persisted API/database names. This mapping exposes Aman
 * outside the three Indonesian landslide-warning levels used operationally by
 * BNPB.
 */
export const nationalWarningLevelByRisk: Readonly<Record<ServerRisk, NationalWarningLevel>> = {
  SAFE: { level: null, label: 'AMAN', displayLabel: 'AMAN' },
  WATCH: { level: 1, label: 'WASPADA', displayLabel: 'WASPADA (TINGKAT 1)' },
  WARNING: { level: 2, label: 'SIAGA', displayLabel: 'SIAGA (TINGKAT 2)' },
  DANGER: { level: 3, label: 'AWAS', displayLabel: 'AWAS (TINGKAT 3)' },
  UNKNOWN: { level: null, label: 'TIDAK DIKETAHUI', displayLabel: 'TIDAK DIKETAHUI' },
};
