import { ConnectivityStatus, type DeviceLifecycleStatus } from '../generated/prisma/enums.js';
import type { RiskReason } from '../risk/risk-engine.types.js';

export interface ConnectivityDecision {
  readonly status: ConnectivityStatus;
  readonly reason: RiskReason | null;
}

export function evaluateConnectivity(input: {
  readonly lifecycleStatus: DeviceLifecycleStatus;
  readonly serverReceivedAt: Date | null;
  readonly evaluationTime: Date;
  readonly onlineWithinMinutes: number;
  readonly offlineAfterMinutes: number;
}): ConnectivityDecision {
  if (input.lifecycleStatus === 'DISABLED' || input.serverReceivedAt === null) {
    return {
      status: ConnectivityStatus.UNKNOWN,
      reason: input.lifecycleStatus === 'DISABLED' ? 'DEVICE_DISABLED' : null,
    };
  }
  const age = input.evaluationTime.getTime() - input.serverReceivedAt.getTime();
  if (age <= input.onlineWithinMinutes * 60_000) {
    return { status: ConnectivityStatus.ONLINE, reason: null };
  }
  if (age <= input.offlineAfterMinutes * 60_000) {
    return {
      status: ConnectivityStatus.DELAYED,
      reason: 'TELEMETRY_DELAYED',
    };
  }
  return {
    status: ConnectivityStatus.OFFLINE,
    reason: 'DEVICE_OFFLINE',
  };
}
