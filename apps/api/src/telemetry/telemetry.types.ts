import type { DeviceLifecycleStatus } from '../generated/prisma/enums.js';
import type { RequestWithContext } from '../common/http/request-context.js';

export interface AuthenticatedDevice {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly monitoringPointId: string;
  readonly hardwareId: string;
  readonly lifecycleStatus: DeviceLifecycleStatus;
  readonly authenticatedCredentialHash: string;
}

export interface DeviceAuthenticatedRequest extends RequestWithContext {
  authenticatedDevice?: AuthenticatedDevice;
}

export interface TelemetryAcceptedResponse {
  readonly accepted: true;
  readonly duplicate: boolean;
  readonly telemetryId: string;
  readonly receivedAt: string;
}
