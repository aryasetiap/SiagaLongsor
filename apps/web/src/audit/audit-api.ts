import type { ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { appendQuery } from '../api/query-string';
import type { AuditLogEntry, AuditLogQuery } from './audit-contracts';

export function listAuditLogs(
  client: OrganizationApiClient,
  organizationId: string,
  query: AuditLogQuery = {},
): Promise<ListEnvelope<AuditLogEntry>> {
  return client.organizationRequest(
    appendQuery('/audit-logs', {
      eventType: query.eventType,
      entityType: query.entityType,
      entityId: query.entityId,
      actorId: query.actorId,
      from: query.from,
      to: query.to,
      cursor: query.cursor,
      limit: query.limit,
    }),
    organizationId,
  );
}
