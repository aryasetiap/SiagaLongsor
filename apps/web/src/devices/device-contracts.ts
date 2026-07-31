import type { CursorQuery, DataEnvelope } from '../api/contracts';

export type DeviceLifecycleStatus = 'ENABLED' | 'DISABLED';
export type NetworkType = 'WIFI' | 'CELLULAR' | 'UNKNOWN';

export type DeviceSort =
  | 'createdAt:desc'
  | 'createdAt:asc'
  | 'updatedAt:desc'
  | 'displayName:asc'
  | 'displayName:desc'
  | 'lastSeenAt:desc';

export interface LastNetwork {
  readonly type: NetworkType;
  readonly signalRssi: number | null;
}

export interface Device {
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
  readonly lastNetwork: LastNetwork | null;
  readonly disabledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DeviceListQuery extends CursorQuery {
  readonly siteId?: string;
  readonly monitoringPointId?: string;
  readonly lifecycleStatus?: DeviceLifecycleStatus;
  readonly search?: string;
  readonly sort?: DeviceSort;
}

export interface RegisterDeviceInput {
  readonly hardwareId: string;
  readonly displayName: string;
  readonly monitoringPointId: string;
}

export interface UpdateDeviceInput {
  readonly displayName?: string;
  readonly monitoringPointId?: string;
}

export interface IssuedDeviceCredential {
  readonly scheme: 'Device';
  readonly hardwareId: string;
  readonly secret: string;
  readonly issuedAt: string;
  readonly displayOnce: true;
}

export interface DeviceCredentialData {
  readonly device: Device;
  readonly credential: IssuedDeviceCredential;
}

export type RegisterDeviceResponse = DataEnvelope<DeviceCredentialData>;
export type RotateCredentialResponse = DataEnvelope<DeviceCredentialData>;
