import type { DataEnvelope, ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { appendQuery } from '../api/query-string';
import type {
  CreateMonitoringPointInput,
  MonitoringPoint,
  MonitoringPointListQuery,
  UpdateMonitoringPointInput,
} from './monitoring-point-contracts';

export function listMonitoringPoints(
  client: OrganizationApiClient,
  organizationId: string,
  query: MonitoringPointListQuery = {},
): Promise<ListEnvelope<MonitoringPoint>> {
  return client.organizationRequest<ListEnvelope<MonitoringPoint>>(
    appendQuery('/monitoring-points', {
      siteId: query.siteId,
      isActive: query.isActive,
      search: query.search,
      cursor: query.cursor,
      limit: query.limit,
      sort: query.sort,
    }),
    organizationId,
  );
}

export function createMonitoringPoint(
  client: OrganizationApiClient,
  organizationId: string,
  input: CreateMonitoringPointInput,
): Promise<DataEnvelope<MonitoringPoint>> {
  return client.organizationRequest<DataEnvelope<MonitoringPoint>>(
    '/monitoring-points',
    organizationId,
    jsonRequest('POST', input),
  );
}

export function getMonitoringPoint(
  client: OrganizationApiClient,
  organizationId: string,
  monitoringPointId: string,
): Promise<DataEnvelope<MonitoringPoint>> {
  return client.organizationRequest<DataEnvelope<MonitoringPoint>>(
    `/monitoring-points/${encodeURIComponent(monitoringPointId)}`,
    organizationId,
  );
}

export function updateMonitoringPoint(
  client: OrganizationApiClient,
  organizationId: string,
  monitoringPointId: string,
  input: UpdateMonitoringPointInput,
): Promise<DataEnvelope<MonitoringPoint>> {
  return client.organizationRequest<DataEnvelope<MonitoringPoint>>(
    `/monitoring-points/${encodeURIComponent(monitoringPointId)}`,
    organizationId,
    jsonRequest('PATCH', input),
  );
}

function jsonRequest(method: 'POST' | 'PATCH', body: object): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
