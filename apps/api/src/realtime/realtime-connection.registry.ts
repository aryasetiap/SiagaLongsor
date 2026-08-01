import { randomUUID } from 'node:crypto';

import { Injectable, type OnModuleDestroy } from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';
import { serializeKeepalive, serializeSseEvent } from './realtime-message.js';
import type { InternalRealtimeMessage } from './realtime.types.js';
import { RealtimeAuthorizationService } from './realtime-authorization.service.js';

export const REALTIME_KEEPALIVE_MILLISECONDS = 15_000;

export interface SseTransport {
  write(chunk: string): boolean;
  end(): void;
  on(event: 'close' | 'error', listener: () => void): void;
  off(event: 'close' | 'error', listener: () => void): void;
}

interface Connection {
  readonly id: string;
  readonly organizationId: string;
  readonly principal: AuthenticatedPrincipal;
  readonly expiresAt: number;
  readonly transport: SseTransport;
  readonly closeListener: () => void;
  expiryTimer: NodeJS.Timeout;
  checkingAuthorization: boolean;
}

@Injectable()
export class RealtimeConnectionRegistry implements OnModuleDestroy {
  private readonly connections = new Map<string, Connection>();
  private readonly keepaliveTimer: NodeJS.Timeout;

  constructor(private readonly authorization: RealtimeAuthorizationService) {
    this.keepaliveTimer = setInterval(
      () => void this.keepaliveAndRevalidate(),
      REALTIME_KEEPALIVE_MILLISECONDS,
    );
    this.keepaliveTimer.unref();
  }

  register(input: {
    readonly organizationId: string;
    readonly principal: AuthenticatedPrincipal;
    readonly expiresAt: number;
    readonly transport: SseTransport;
  }): string {
    const id = randomUUID();
    const closeListener = () => this.remove(id, false);
    const delay = Math.max(0, input.expiresAt - Date.now());
    const connection: Connection = {
      id,
      organizationId: input.organizationId,
      principal: input.principal,
      expiresAt: input.expiresAt,
      transport: input.transport,
      closeListener,
      expiryTimer: setTimeout(() => this.remove(id, true), delay),
      checkingAuthorization: false,
    };
    connection.expiryTimer.unref();
    input.transport.on('close', closeListener);
    input.transport.on('error', closeListener);
    this.connections.set(id, connection);
    return id;
  }

  deliver(message: InternalRealtimeMessage): void {
    const serialized = serializeSseEvent(message);
    for (const connection of [...this.connections.values()]) {
      if (connection.organizationId !== message.organizationId) continue;
      if (!connection.transport.write(serialized)) this.remove(connection.id, true);
    }
  }

  remove(connectionId: string, endTransport = true): void {
    const connection = this.connections.get(connectionId);
    if (connection === undefined) return;
    this.connections.delete(connectionId);
    clearTimeout(connection.expiryTimer);
    connection.transport.off('close', connection.closeListener);
    connection.transport.off('error', connection.closeListener);
    if (endTransport) connection.transport.end();
  }

  diagnostics(): { readonly activeConnections: number; readonly organizations: number } {
    return {
      activeConnections: this.connections.size,
      organizations: new Set([...this.connections.values()].map((entry) => entry.organizationId))
        .size,
    };
  }

  onModuleDestroy(): void {
    clearInterval(this.keepaliveTimer);
    for (const connection of [...this.connections.values()]) this.remove(connection.id, true);
  }

  revalidateConnections(): Promise<void> {
    return this.keepaliveAndRevalidate();
  }

  private async keepaliveAndRevalidate(): Promise<void> {
    for (const connection of [...this.connections.values()]) {
      if (connection.checkingAuthorization) continue;
      if (Date.now() >= connection.expiresAt) {
        this.remove(connection.id, true);
        continue;
      }
      connection.checkingAuthorization = true;
      try {
        const active = await this.authorization.remainsAuthorized(
          connection.principal,
          connection.organizationId,
        );
        if (!active || !connection.transport.write(serializeKeepalive())) {
          this.remove(connection.id, true);
        }
      } catch {
        this.remove(connection.id, true);
      } finally {
        connection.checkingAuthorization = false;
      }
    }
  }
}
