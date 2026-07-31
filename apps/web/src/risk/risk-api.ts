import type { DataEnvelope, ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { appendQuery } from '../api/query-string';
import type {
  Alert,
  AlertListQuery,
  MonitoringOverviewItem,
  MonitoringOverviewQuery,
  RiskAssessment,
  RiskProfile,
  UpdateRiskProfileInput,
} from './risk-contracts';

export function listMonitoringOverview(
  client: OrganizationApiClient,
  organizationId: string,
  query: MonitoringOverviewQuery = {},
): Promise<ListEnvelope<MonitoringOverviewItem>> {
  return client.organizationRequest(
    appendQuery('/monitoring-overview', {
      siteId: query.siteId,
      riskLevel: query.riskLevel,
      connectivityStatus: query.connectivityStatus,
      search: query.search,
      cursor: query.cursor,
      limit: query.limit,
      sort: query.sort,
    }),
    organizationId,
  );
}

export function listRiskAssessments(
  client: OrganizationApiClient,
  organizationId: string,
  monitoringPointId: string,
  query: { readonly cursor?: string; readonly limit?: number } = {},
): Promise<ListEnvelope<RiskAssessment>> {
  return client.organizationRequest(
    appendQuery(`/monitoring-points/${encodeURIComponent(monitoringPointId)}/risk-assessments`, {
      cursor: query.cursor,
      limit: query.limit,
    }),
    organizationId,
  );
}

export function listAlerts(
  client: OrganizationApiClient,
  organizationId: string,
  query: AlertListQuery = {},
): Promise<ListEnvelope<Alert>> {
  return client.organizationRequest(
    appendQuery('/alerts', {
      siteId: query.siteId,
      monitoringPointId: query.monitoringPointId,
      type: query.type,
      severity: query.severity,
      status: query.status,
      cursor: query.cursor,
      limit: query.limit,
      sort: query.sort,
    }),
    organizationId,
  );
}

export function getAlert(
  client: OrganizationApiClient,
  organizationId: string,
  alertId: string,
): Promise<DataEnvelope<Alert>> {
  return client.organizationRequest(`/alerts/${encodeURIComponent(alertId)}`, organizationId);
}

export function getRiskProfile(
  client: OrganizationApiClient,
  organizationId: string,
  siteId: string,
): Promise<DataEnvelope<RiskProfile>> {
  return client.organizationRequest(
    `/sites/${encodeURIComponent(siteId)}/risk-profile`,
    organizationId,
  );
}

export function updateRiskProfile(
  client: OrganizationApiClient,
  organizationId: string,
  siteId: string,
  input: UpdateRiskProfileInput,
): Promise<DataEnvelope<{ readonly profile: RiskProfile; readonly changed: boolean }>> {
  return client.organizationRequest(
    `/sites/${encodeURIComponent(siteId)}/risk-profile`,
    organizationId,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}
