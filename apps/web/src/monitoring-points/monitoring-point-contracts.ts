import type { CursorQuery } from '../api/contracts';
import type { DeviceLifecycleStatus } from '../devices/device-contracts';

export type MonitoringPointSort =
  'createdAt:desc' | 'createdAt:asc' | 'updatedAt:desc' | 'name:asc' | 'name:desc';

export interface DeviceSummary {
  readonly id: string;
  readonly hardwareId: string;
  readonly displayName: string;
  readonly lifecycleStatus: DeviceLifecycleStatus;
  readonly lastSeenAt: string | null;
}

export interface MonitoringPoint {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly name: string;
  readonly description: string | null;
  readonly locationDescription: string | null;
  readonly isActive: boolean;
  readonly currentDevice: DeviceSummary | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MonitoringPointListQuery extends CursorQuery {
  readonly siteId?: string;
  readonly isActive?: boolean;
  readonly search?: string;
  readonly sort?: MonitoringPointSort;
}

export interface CreateMonitoringPointInput {
  readonly siteId: string;
  readonly name: string;
  readonly description?: string | null;
  readonly locationDescription?: string | null;
}

export interface UpdateMonitoringPointInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly locationDescription?: string | null;
  readonly isActive?: boolean;
}
