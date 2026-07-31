import type { DataEnvelope, ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { appendQuery } from '../api/query-string';
import type {
  Device,
  DeviceListQuery,
  RegisterDeviceInput,
  RegisterDeviceResponse,
  RotateCredentialResponse,
  UpdateDeviceInput,
} from './device-contracts';

export function listDevices(
  client: OrganizationApiClient,
  organizationId: string,
  query: DeviceListQuery = {},
): Promise<ListEnvelope<Device>> {
  return client.organizationRequest<ListEnvelope<Device>>(
    appendQuery('/devices', {
      siteId: query.siteId,
      monitoringPointId: query.monitoringPointId,
      lifecycleStatus: query.lifecycleStatus,
      search: query.search,
      cursor: query.cursor,
      limit: query.limit,
      sort: query.sort,
    }),
    organizationId,
  );
}

export function registerDevice(
  client: OrganizationApiClient,
  organizationId: string,
  input: RegisterDeviceInput,
): Promise<RegisterDeviceResponse> {
  return client.organizationRequest<RegisterDeviceResponse>(
    '/devices',
    organizationId,
    jsonRequest('POST', input),
  );
}

export function getDevice(
  client: OrganizationApiClient,
  organizationId: string,
  deviceId: string,
): Promise<DataEnvelope<Device>> {
  return client.organizationRequest<DataEnvelope<Device>>(
    `/devices/${encodeURIComponent(deviceId)}`,
    organizationId,
  );
}

export function updateDevice(
  client: OrganizationApiClient,
  organizationId: string,
  deviceId: string,
  input: UpdateDeviceInput,
): Promise<DataEnvelope<Device>> {
  return client.organizationRequest<DataEnvelope<Device>>(
    `/devices/${encodeURIComponent(deviceId)}`,
    organizationId,
    jsonRequest('PATCH', input),
  );
}

export function rotateDeviceCredential(
  client: OrganizationApiClient,
  organizationId: string,
  deviceId: string,
): Promise<RotateCredentialResponse> {
  return client.organizationRequest<RotateCredentialResponse>(
    `/devices/${encodeURIComponent(deviceId)}/rotate-credential`,
    organizationId,
    { method: 'POST' },
  );
}

export function disableDevice(
  client: OrganizationApiClient,
  organizationId: string,
  deviceId: string,
): Promise<DataEnvelope<Device>> {
  return client.organizationRequest<DataEnvelope<Device>>(
    `/devices/${encodeURIComponent(deviceId)}/disable`,
    organizationId,
    { method: 'POST' },
  );
}

function jsonRequest(method: 'POST' | 'PATCH', body: object): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
