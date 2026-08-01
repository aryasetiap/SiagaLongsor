import type { AlertStatus } from '../generated/prisma/enums.js';
import type { AlertData } from '../risk/risk-read.types.js';

export type LifecycleActionType = 'ACKNOWLEDGE' | 'RESOLVE' | 'FALSE_ALARM';
export type LifecycleEventType = 'ALERT_ACKNOWLEDGED' | 'ALERT_RESOLVED' | 'ALERT_FALSE_ALARM';

export interface SafeActorSummary {
  readonly id: string;
  readonly name: string;
}

export interface AlertLifecycleActionSummary {
  readonly actionId: string;
  readonly eventId: string;
  readonly eventType: LifecycleEventType;
  readonly previousStatus: AlertStatus;
  readonly nextStatus: AlertStatus;
  readonly actedAt: string;
  readonly actor: SafeActorSummary;
}

export interface AlertMutationResponse {
  readonly data: AlertData;
  readonly action: AlertLifecycleActionSummary;
}

export interface AlertLifecycleCommittedEvent {
  readonly eventType: LifecycleEventType;
  readonly occurredAt: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly monitoringPointId: string;
  readonly alertId: string;
}

export interface AlertEventData {
  readonly id: string;
  readonly eventType: string;
  readonly observedAt: string | null;
  readonly actedAt: string | null;
  readonly createdAt: string;
  readonly actor: SafeActorSummary | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly riskAssessmentId: string | null;
  readonly telemetryId: string | null;
}

export interface AlertEventListResponse {
  readonly data: readonly AlertEventData[];
  readonly page: { readonly nextCursor: string | null; readonly hasMore: boolean };
}
