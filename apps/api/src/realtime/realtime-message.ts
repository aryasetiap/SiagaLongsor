import {
  REALTIME_EVENT_TYPES,
  type InternalRealtimeMessage,
  type PublicRealtimeEvent,
} from './realtime.types.js';

const eventTypes = new Set<string>(REALTIME_EVENT_TYPES);

export function parseInternalRealtimeMessage(raw: string): InternalRealtimeMessage | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || Array.isArray(value) || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    if (
      candidate.version !== 1 ||
      !nonEmpty(candidate.eventId) ||
      !nonEmpty(candidate.eventType) ||
      !eventTypes.has(candidate.eventType) ||
      !validTimestamp(candidate.occurredAt) ||
      !nonEmpty(candidate.organizationId) ||
      !nullableIdentifier(candidate.siteId) ||
      !nullableIdentifier(candidate.monitoringPointId) ||
      !nullableIdentifier(candidate.alertId)
    ) {
      return null;
    }
    return candidate as unknown as InternalRealtimeMessage;
  } catch {
    return null;
  }
}

export function toPublicRealtimeEvent(message: InternalRealtimeMessage): PublicRealtimeEvent {
  return {
    eventId: message.eventId,
    eventType: message.eventType,
    occurredAt: message.occurredAt,
    siteId: message.siteId,
    monitoringPointId: message.monitoringPointId,
    alertId: message.alertId,
  };
}

export function serializeSseEvent(message: InternalRealtimeMessage): string {
  const event = toPublicRealtimeEvent(message);
  return `id: ${event.eventId}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function serializeKeepalive(): string {
  return ': keepalive\n\n';
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/[\r\n]/.test(value);
}

function nullableIdentifier(value: unknown): value is string | null {
  return value === null || nonEmpty(value);
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}
