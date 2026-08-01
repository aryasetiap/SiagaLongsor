import { describe, expect, it } from 'vitest';

import {
  parseInternalRealtimeMessage,
  serializeKeepalive,
  serializeSseEvent,
  toPublicRealtimeEvent,
} from './realtime-message.js';
import type { InternalRealtimeMessage } from './realtime.types.js';

const message: InternalRealtimeMessage = {
  version: 1,
  eventId: 'event-1',
  eventType: 'ALERT_CREATED',
  occurredAt: '2026-08-01T10:00:00.000Z',
  organizationId: 'organization-1',
  siteId: 'site-1',
  monitoringPointId: 'point-1',
  alertId: 'alert-1',
};

describe('realtime message', () => {
  it('serializes the exact public SSE envelope without internal organization routing data', () => {
    const serialized = serializeSseEvent(message);
    expect(serialized).toBe(
      `id: event-1\nevent: ALERT_CREATED\ndata: ${JSON.stringify(toPublicRealtimeEvent(message))}\n\n`,
    );
    expect(serialized).not.toContain('organizationId');
  });

  it('serializes keepalive as an SSE comment without a domain event', () => {
    expect(serializeKeepalive()).toBe(': keepalive\n\n');
  });

  it('accepts a supported version and event type', () => {
    expect(parseInternalRealtimeMessage(JSON.stringify(message))).toEqual(message);
  });

  it.each([
    ['malformed JSON', '{'],
    ['future version', JSON.stringify({ ...message, version: 2 })],
    ['unknown type', JSON.stringify({ ...message, eventType: 'FUTURE_EVENT' })],
    ['newline injection', JSON.stringify({ ...message, eventId: 'bad\nid' })],
    ['missing organization', JSON.stringify({ ...message, organizationId: '' })],
  ])('ignores %s safely', (_name, raw) => {
    expect(parseInternalRealtimeMessage(raw)).toBeNull();
  });
});
