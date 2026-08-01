import type { DataEnvelope, ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { appendQuery } from '../api/query-string';
import type {
  Alert,
  AlertEvent,
  AlertListQuery,
  MonitoringOverviewItem,
  MonitoringOverviewQuery,
  RiskAssessment,
  RiskProfile,
  UpdateRiskProfileInput,
  AlertMutationResponse,
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

export function listAlertEvents(
  client: OrganizationApiClient,
  organizationId: string,
  alertId: string,
  query: { readonly cursor?: string; readonly limit?: number } = {},
): Promise<ListEnvelope<AlertEvent>> {
  return client.organizationRequest(
    appendQuery(`/alerts/${encodeURIComponent(alertId)}/events`, query),
    organizationId,
  );
}

export function acknowledgeAlert(
  client: OrganizationApiClient,
  organizationId: string,
  alertId: string,
  input: {
    readonly actionId: string;
    readonly note: string;
    readonly fieldCondition: string;
    readonly sopExecuted: boolean;
  },
): Promise<AlertMutationResponse> {
  return mutateAlert(client, organizationId, alertId, 'acknowledge', input);
}

export function resolveAlert(
  client: OrganizationApiClient,
  organizationId: string,
  alertId: string,
  input: { readonly actionId: string; readonly resolutionNote: string },
): Promise<AlertMutationResponse> {
  return mutateAlert(client, organizationId, alertId, 'resolve', input);
}

export function markAlertFalseAlarm(
  client: OrganizationApiClient,
  organizationId: string,
  alertId: string,
  input: { readonly actionId: string; readonly reason: string },
): Promise<AlertMutationResponse> {
  return mutateAlert(client, organizationId, alertId, 'false-alarm', input);
}

function mutateAlert<T extends { readonly actionId: string }>(
  client: OrganizationApiClient,
  organizationId: string,
  alertId: string,
  action: 'acknowledge' | 'resolve' | 'false-alarm',
  input: T,
): Promise<AlertMutationResponse> {
  return client.organizationRequest(
    `/alerts/${encodeURIComponent(alertId)}/${action}`,
    organizationId,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': input.actionId,
      },
      body: JSON.stringify(input),
    },
  );
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
