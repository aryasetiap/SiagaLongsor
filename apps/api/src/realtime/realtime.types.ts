export const REALTIME_EVENT_TYPES = [
  'ALERT_CREATED',
  'ALERT_OBSERVED',
  'ALERT_ACKNOWLEDGED',
  'ALERT_RESOLVED',
  'ALERT_FALSE_ALARM',
  'MONITORING_POINT_STATE_CHANGED',
] as const;

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number];

export interface RealtimeDescriptor {
  readonly eventType: RealtimeEventType;
  readonly occurredAt: string;
  readonly organizationId: string;
  readonly siteId: string | null;
  readonly monitoringPointId: string | null;
  readonly alertId: string | null;
}

export interface InternalRealtimeMessage extends RealtimeDescriptor {
  readonly version: 1;
  readonly eventId: string;
}

export interface PublicRealtimeEvent {
  readonly eventId: string;
  readonly eventType: RealtimeEventType;
  readonly occurredAt: string;
  readonly siteId: string | null;
  readonly monitoringPointId: string | null;
  readonly alertId: string | null;
}
