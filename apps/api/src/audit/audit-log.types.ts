import type { SafeActorSummary } from '../alerts/alert-lifecycle.types.js';

export interface AuditLogData {
  readonly id: string;
  readonly eventType: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly actor: SafeActorSummary | null;
  readonly requestId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface AuditLogListResponse {
  readonly data: readonly AuditLogData[];
  readonly page: { readonly nextCursor: string | null; readonly hasMore: boolean };
}
