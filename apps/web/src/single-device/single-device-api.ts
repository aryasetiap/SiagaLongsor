import type { ApiClient } from '../auth/api-client';
import type {
  AuditResponse,
  Diagnostics,
  Overview,
  ProfileResponse,
} from './single-device-contracts';
type Client = Pick<ApiClient, 'request'>;
export const getSingleDeviceOverview = (client: Client, from?: string, to?: string) =>
  client.request<Overview>(
    `/overview${from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : ''}`,
  );
export const getSingleDeviceDiagnostics = (client: Client) =>
  client.request<Diagnostics>('/device');
export const getSingleDeviceRiskProfile = (client: Client) =>
  client.request<ProfileResponse>('/risk-profile');
export const updateSingleDeviceRiskProfile = (client: Client, body: unknown) =>
  client.request<{ data: { profile: ProfileResponse['data']; changed: boolean } }>(
    '/risk-profile',
    { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  );
export const listSingleDeviceAuditLog = (client: Client, cursor?: string) =>
  client.request<AuditResponse>(
    `/audit-log?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  );
