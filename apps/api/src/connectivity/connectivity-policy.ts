import {
  AlertType,
  ConnectivityStatus,
  type DeviceLifecycleStatus,
} from '../generated/prisma/enums.js';
import type { RiskReason } from '../risk/risk-engine.types.js';

export interface ConnectivityDecision {
  readonly status: ConnectivityStatus;
  readonly reason: RiskReason | null;
  readonly alertType: AlertType | null;
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
      alertType: null,
    };
  }
  const age = input.evaluationTime.getTime() - input.serverReceivedAt.getTime();
  if (age <= input.onlineWithinMinutes * 60_000) {
    return { status: ConnectivityStatus.ONLINE, reason: null, alertType: null };
  }
  if (age <= input.offlineAfterMinutes * 60_000) {
    return {
      status: ConnectivityStatus.DELAYED,
      reason: 'TELEMETRY_DELAYED',
      alertType: AlertType.DEVICE_DELAYED,
    };
  }
  return {
    status: ConnectivityStatus.OFFLINE,
    reason: 'DEVICE_OFFLINE',
    alertType: AlertType.DEVICE_OFFLINE,
  };
}
