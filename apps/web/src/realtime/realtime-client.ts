import type { ApiClient } from '../auth/api-client';
import { SseParser, type RealtimeEvent } from './sse-parser';

export const reconnectScheduleMilliseconds = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

export interface RealtimeStreamClient {
  openOrganizationStream(
    path: string,
    organizationId: string,
    signal: AbortSignal,
  ): Promise<Response>;
  refreshSession(): Promise<boolean>;
}

export async function consumeRealtimeStream(input: {
  readonly client: Pick<ApiClient, 'openOrganizationStream'> | RealtimeStreamClient;
  readonly organizationId: string;
  readonly signal: AbortSignal;
  readonly onConnected: () => void;
  readonly onEvent: (event: RealtimeEvent) => void;
}): Promise<void> {
  const response = await input.client.openOrganizationStream(
    '/realtime/stream',
    input.organizationId,
    input.signal,
  );
  if (response.body === null) throw new Error('Realtime response body tidak tersedia.');
  input.onConnected();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser(input.onEvent);
  try {
    while (!input.signal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) break;
      parser.push(decoder.decode(chunk.value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.finish();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (!input.signal.aborted) throw new Error('Realtime stream terputus.');
}

export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const base =
    reconnectScheduleMilliseconds[Math.min(attempt, reconnectScheduleMilliseconds.length - 1)]!;
  const boundedRandom = Math.min(1, Math.max(0, random()));
  return Math.round(base * (0.8 + boundedRandom * 0.4));
}

export function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}
