export const realtimeEventTypes = [
  'ALERT_CREATED',
  'ALERT_OBSERVED',
  'ALERT_ACKNOWLEDGED',
  'ALERT_RESOLVED',
  'ALERT_FALSE_ALARM',
  'MONITORING_POINT_STATE_CHANGED',
] as const;

export type RealtimeEventType = (typeof realtimeEventTypes)[number];

export interface RealtimeEvent {
  readonly eventId: string;
  readonly eventType: RealtimeEventType;
  readonly occurredAt: string;
  readonly siteId: string | null;
  readonly monitoringPointId: string | null;
  readonly alertId: string | null;
}

const supportedTypes = new Set<string>(realtimeEventTypes);

export class SseParser {
  private buffer = '';
  private eventId = '';
  private eventName = '';
  private dataLines: string[] = [];

  constructor(private readonly onEvent: (event: RealtimeEvent) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    let boundary = this.findLineBoundary();
    while (boundary !== null) {
      const line = this.buffer.slice(0, boundary);
      const terminatorLength =
        this.buffer[boundary] === '\r' && this.buffer[boundary + 1] === '\n' ? 2 : 1;
      this.buffer = this.buffer.slice(boundary + terminatorLength);
      this.processLine(line);
      boundary = this.findLineBoundary();
    }
  }

  finish(): void {
    if (this.buffer.length > 0) {
      this.processLine(this.buffer.endsWith('\r') ? this.buffer.slice(0, -1) : this.buffer);
    }
    this.buffer = '';
    this.dispatch();
  }

  private processLine(line: string): void {
    if (line.length === 0) {
      this.dispatch();
      return;
    }
    if (line.startsWith(':')) return;
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'id' && !value.includes('\0')) this.eventId = value;
    if (field === 'event') this.eventName = value;
    if (field === 'data') this.dataLines.push(value);
  }

  private findLineBoundary(): number | null {
    for (let index = 0; index < this.buffer.length; index += 1) {
      const character = this.buffer[index];
      if (character === '\n') return index;
      if (character === '\r') {
        return index === this.buffer.length - 1 ? null : index;
      }
    }
    return null;
  }

  private dispatch(): void {
    const rawData = this.dataLines.join('\n');
    const eventName = this.eventName;
    const eventId = this.eventId;
    this.eventName = '';
    this.dataLines = [];
    if (rawData.length === 0 || !supportedTypes.has(eventName)) return;
    try {
      const candidate: unknown = JSON.parse(rawData);
      if (!isRealtimeEvent(candidate, eventName, eventId)) return;
      this.onEvent(candidate);
    } catch {
      // Malformed notification is ignored; REST remains authoritative.
    }
  }
}

function isRealtimeEvent(
  value: unknown,
  eventName: string,
  eventId: string,
): value is RealtimeEvent {
  if (!isRecord(value)) return false;
  return (
    value.eventId === eventId &&
    value.eventType === eventName &&
    supportedTypes.has(eventName) &&
    typeof value.occurredAt === 'string' &&
    !Number.isNaN(Date.parse(value.occurredAt)) &&
    nullableString(value.siteId) &&
    nullableString(value.monitoringPointId) &&
    nullableString(value.alertId)
  );
}

function nullableString(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
