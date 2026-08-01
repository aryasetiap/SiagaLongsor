import type { DataEnvelope, OrganizationApiClient } from '../api/contracts';
import { appendQuery } from '../api/query-string';
import type {
  DashboardSummary,
  DashboardSummaryQuery,
  SensorSeriesQuery,
  SensorSeriesResponse,
} from './dashboard-contracts';

export function getDashboardSummary(
  client: OrganizationApiClient,
  organizationId: string,
  query: DashboardSummaryQuery = {},
): Promise<DataEnvelope<DashboardSummary>> {
  return client.organizationRequest(
    appendQuery('/dashboard/summary', {
      siteId: query.siteId,
      windowHours: query.windowHours,
    }),
    organizationId,
  );
}

export function getSensorSeries(
  client: OrganizationApiClient,
  organizationId: string,
  monitoringPointId: string,
  query: SensorSeriesQuery = {},
): Promise<SensorSeriesResponse> {
  return client.organizationRequest(
    appendQuery(`/monitoring-points/${encodeURIComponent(monitoringPointId)}/sensor-series`, {
      from: query.from,
      to: query.to,
      includeLate: query.includeLate,
      cursor: query.cursor,
      limit: query.limit,
    }),
    organizationId,
  );
}
