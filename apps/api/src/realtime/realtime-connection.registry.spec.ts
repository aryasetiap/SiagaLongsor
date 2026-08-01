import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Role } from '../generated/prisma/enums.js';
import {
  REALTIME_KEEPALIVE_MILLISECONDS,
  RealtimeConnectionRegistry,
  type SseTransport,
} from './realtime-connection.registry.js';
import type { RealtimeAuthorizationService } from './realtime-authorization.service.js';
import type { InternalRealtimeMessage } from './realtime.types.js';

const principal = {
  userId: 'user-1',
  sessionId: 'session-1',
  email: 'operator@example.invalid',
  name: 'Operator',
  memberships: [{ organizationId: 'org-a', organizationName: 'A', role: Role.PROJECT_OWNER }],
};
const message: InternalRealtimeMessage = {
  version: 1,
  eventId: 'event-1',
  eventType: 'MONITORING_POINT_STATE_CHANGED',
  occurredAt: '2026-08-01T10:00:00.000Z',
  organizationId: 'org-a',
  siteId: 'site-1',
  monitoringPointId: 'point-1',
  alertId: null,
};

class FakeTransport extends EventEmitter implements SseTransport {
  readonly chunks: string[] = [];
  ended = false;
  writable = true;

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return this.writable;
  }

  end(): void {
    this.ended = true;
  }
}

describe('RealtimeConnectionRegistry', () => {
  afterEach(() => vi.useRealTimers());

  it('routes only to the immutable matching organization', () => {
    const registry = createRegistry();
    const matching = new FakeTransport();
    const other = new FakeTransport();
    registry.register({
      organizationId: 'org-a',
      principal,
      expiresAt: Date.now() + 60_000,
      transport: matching,
    });
    registry.register({
      organizationId: 'org-b',
      principal,
      expiresAt: Date.now() + 60_000,
      transport: other,
    });

    registry.deliver(message);

    expect(matching.chunks).toHaveLength(1);
    expect(other.chunks).toHaveLength(0);
    registry.onModuleDestroy();
  });

  it('cleans a disconnected client and releases its listeners', () => {
    const registry = createRegistry();
    const transport = new FakeTransport();
    registry.register({
      organizationId: 'org-a',
      principal,
      expiresAt: Date.now() + 60_000,
      transport,
    });
    expect(registry.diagnostics().activeConnections).toBe(1);

    transport.emit('close');

    expect(registry.diagnostics().activeConnections).toBe(0);
    expect(transport.listenerCount('close')).toBe(0);
    expect(transport.listenerCount('error')).toBe(0);
    registry.onModuleDestroy();
  });

  it('terminates immediately on backpressure without creating a queue', () => {
    const registry = createRegistry();
    const transport = new FakeTransport();
    transport.writable = false;
    registry.register({
      organizationId: 'org-a',
      principal,
      expiresAt: Date.now() + 60_000,
      transport,
    });

    registry.deliver(message);

    expect(transport.chunks).toHaveLength(1);
    expect(transport.ended).toBe(true);
    expect(registry.diagnostics().activeConnections).toBe(0);
    registry.onModuleDestroy();
  });

  it('closes no later than verified access-token expiry', async () => {
    vi.useFakeTimers();
    const registry = createRegistry();
    const transport = new FakeTransport();
    registry.register({
      organizationId: 'org-a',
      principal,
      expiresAt: Date.now() + 1_000,
      transport,
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(transport.ended).toBe(true);
    expect(registry.diagnostics().activeConnections).toBe(0);
    registry.onModuleDestroy();
  });

  it('sends a comment keepalive and closes an inactive membership on watchdog validation', async () => {
    const remainsAuthorized = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const registry = createRegistry(remainsAuthorized);
    const transport = new FakeTransport();
    registry.register({
      organizationId: 'org-a',
      principal,
      expiresAt: Date.now() + 60_000,
      transport,
    });

    await registry.revalidateConnections();
    expect(transport.chunks).toEqual([': keepalive\n\n']);
    await registry.revalidateConnections();

    expect(transport.ended).toBe(true);
    expect(registry.diagnostics().activeConnections).toBe(0);
    registry.onModuleDestroy();
  });

  it('uses the contract keepalive cadence', () => {
    expect(REALTIME_KEEPALIVE_MILLISECONDS).toBe(15_000);
  });
});

function createRegistry(remainsAuthorized = vi.fn().mockResolvedValue(true)) {
  return new RealtimeConnectionRegistry({
    remainsAuthorized,
  } as unknown as RealtimeAuthorizationService);
}
