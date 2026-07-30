import type { DeviceLifecycleStatus } from '../generated/prisma/enums.js';

export interface DeviceSummaryResponse {
  readonly id: string;
  readonly hardwareId: string;
  readonly displayName: string;
  readonly lifecycleStatus: DeviceLifecycleStatus;
  readonly lastSeenAt: string | null;
}

export interface MonitoringPointResponseData {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly name: string;
  readonly description: string | null;
  readonly locationDescription: string | null;
  readonly isActive: boolean;
  readonly currentDevice: DeviceSummaryResponse | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MonitoringPointResponse {
  readonly data: MonitoringPointResponseData;
}

export interface MonitoringPointListResponse {
  readonly data: MonitoringPointResponseData[];
  readonly page: {
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  };
}
