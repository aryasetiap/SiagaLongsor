import type { CursorQuery } from '../api/contracts';
import type { AlertEventMetadata, SafeActorSummary } from '../risk/risk-contracts';

export interface AuditLogEntry {
  readonly id: string;
  readonly eventType: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly actor: SafeActorSummary | null;
  readonly requestId: string;
  readonly metadata: AlertEventMetadata;
  readonly createdAt: string;
}

export interface AuditLogQuery extends CursorQuery {
  readonly eventType?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly actorId?: string;
  readonly from?: string;
  readonly to?: string;
}
