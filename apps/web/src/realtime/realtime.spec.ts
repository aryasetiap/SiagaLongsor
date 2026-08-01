import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '../auth/api-client';
import { InvalidationCoalescer } from './invalidation-coalescer';
import {
  abortableDelay,
  consumeRealtimeStream,
  reconnectDelay,
  reconnectScheduleMilliseconds,
} from './realtime-client';
import { SseParser, type RealtimeEvent } from './sse-parser';

const event: RealtimeEvent = {
  eventId: 'event-1',
  eventType: 'ALERT_CREATED',
  occurredAt: '2026-08-01T10:00:00.000Z',
  siteId: 'site-1',
  monitoringPointId: 'point-1',
  alertId: 'alert-1',
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SseParser', () => {
  it('parses an event split across arbitrary chunks and CRLF boundaries', () => {
    const received: RealtimeEvent[] = [];
    const parser = new SseParser((value) => received.push(value));
    const wire = `id: ${event.eventId}\r\nevent: ${event.eventType}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`;

    for (const chunk of [wire.slice(0, 4), wire.slice(4, 17), wire.slice(17, -3), '\r', '\n']) {
      parser.push(chunk);
    }

    expect(received).toEqual([event]);
  });

  it('supports valid multiline data and ignores keepalive comments', () => {
    const received: RealtimeEvent[] = [];
    const parser = new SseParser((value) => received.push(value));
    const pretty = JSON.stringify(event, null, 2)
      .split('\n')
      .map((line) => `data: ${line}`)
      .join('\n');
    parser.push(`: keepalive\n\nid: event-1\nevent: ALERT_CREATED\n${pretty}\n\n`);

    expect(received).toEqual([event]);
  });

  it.each([
    'id: bad\nevent: ALERT_CREATED\ndata: not-json\n\n',
    `id: event-1\nevent: FUTURE_EVENT\ndata: ${JSON.stringify({ ...event, eventType: 'FUTURE_EVENT' })}\n\n`,
    `id: other-id\nevent: ALERT_CREATED\ndata: ${JSON.stringify(event)}\n\n`,
  ])('ignores malformed, unknown, or inconsistent notification safely', (wire) => {
    const listener = vi.fn();
    const parser = new SseParser(listener);
    expect(() => parser.push(wire)).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('realtime transport', () => {
  it('uses memory bearer and organization headers without putting a token in the URL', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith('/auth/login')) return jsonResponse(authResponse());
      if (String(input).endsWith('/auth/me')) return jsonResponse(authResponse().user);
      return new Response(streamFrom(': keepalive\n\n'), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
    const client = new ApiClient('http://localhost:3001/api/v1', fetchMock as typeof fetch);
    await client.login({ email: 'operator@example.test', password: 'not-a-real-secret' });
    const controller = new AbortController();

    await client.openOrganizationStream('/realtime/stream', 'org-1', controller.signal);

    const streamCall = calls.at(-1)!;
    const headers = new Headers(streamCall.init.headers);
    expect(streamCall.url).toBe('http://localhost:3001/api/v1/realtime/stream');
    expect(new URL(streamCall.url).search).toBe('');
    expect(headers.get('authorization')).toBe('Bearer access-in-memory');
    expect(headers.get('x-organization-id')).toBe('org-1');
    expect(headers.get('accept')).toBe('text/event-stream');
    expect(streamCall.init.credentials).toBe('include');
  });

  it('parses streamed chunks and treats EOF as a reconnect signal', async () => {
    const received: RealtimeEvent[] = [];
    const wire = `id: event-1\nevent: ALERT_CREATED\ndata: ${JSON.stringify(event)}\n\n`;
    const client = {
      openOrganizationStream: vi.fn(
        async () => new Response(streamFrom(wire.slice(0, 19), wire.slice(19)), { status: 200 }),
      ),
    };

    await expect(
      consumeRealtimeStream({
        client,
        organizationId: 'org-1',
        signal: new AbortController().signal,
        onConnected: vi.fn(),
        onEvent: (value) => received.push(value),
      }),
    ).rejects.toThrow('Realtime stream terputus.');
    expect(received).toEqual([event]);
  });

  it('uses the bounded reconnect sequence, bounded jitter, and abortable timer cleanup', async () => {
    expect(reconnectScheduleMilliseconds).toEqual([1_000, 2_000, 5_000, 10_000, 30_000]);
    expect(reconnectDelay(0, () => 0)).toBe(800);
    expect(reconnectDelay(0, () => 1)).toBe(1_200);
    expect(reconnectDelay(99, () => 0.5)).toBe(30_000);

    vi.useFakeTimers();
    const controller = new AbortController();
    const delay = abortableDelay(30_000, controller.signal);
    controller.abort(new Error('organization changed'));
    await expect(delay).rejects.toThrow('organization changed');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('InvalidationCoalescer', () => {
  it('coalesces bursts per resource category and clears pending work', () => {
    vi.useFakeTimers();
    const flushed = vi.fn();
    const coalescer = new InvalidationCoalescer(flushed, 100);
    coalescer.schedule(['alerts', 'alerts', 'dashboard']);
    coalescer.schedule(['alerts', 'monitoring']);
    vi.advanceTimersByTime(100);
    expect(flushed.mock.calls.map(([category]) => category).sort()).toEqual([
      'alerts',
      'dashboard',
      'monitoring',
    ]);

    coalescer.schedule(['selectedAlert']);
    coalescer.clear();
    vi.runAllTimers();
    expect(flushed).toHaveBeenCalledTimes(3);
  });
});

function streamFrom(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function authResponse() {
  return {
    accessToken: 'access-in-memory',
    expiresIn: 900,
    tokenType: 'Bearer' as const,
    user: {
      id: 'user-1',
      name: 'Operator',
      email: 'operator@example.test',
      status: 'ACTIVE' as const,
      memberships: [],
    },
  };
}
