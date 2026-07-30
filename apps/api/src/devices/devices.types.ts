import type { DeviceLifecycleStatus, NetworkType } from '../generated/prisma/enums.js';

export interface DeviceResponseData {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly monitoringPointId: string;
  readonly hardwareId: string;
  readonly displayName: string;
  readonly lifecycleStatus: DeviceLifecycleStatus;
  readonly firmwareVersion: string | null;
  readonly lastSeenAt: string | null;
  readonly lastTelemetryAt: string | null;
  readonly lastNetwork: {
    readonly type: NetworkType;
    readonly signalRssi: number | null;
  } | null;
  readonly disabledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DeviceResponse {
  readonly data: DeviceResponseData;
}

export interface DeviceListResponse {
  readonly data: DeviceResponseData[];
  readonly page: {
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  };
}

export interface IssuedCredentialResponse {
  readonly scheme: 'Device';
  readonly hardwareId: string;
  readonly secret: string;
  readonly issuedAt: string;
  readonly displayOnce: true;
}

export interface DeviceCredentialResponse {
  readonly data: {
    readonly device: DeviceResponseData;
    readonly credential: IssuedCredentialResponse;
  };
}
