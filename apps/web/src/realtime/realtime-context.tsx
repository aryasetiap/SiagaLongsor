'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '../auth/auth-context';
import { getDefaultApiClient } from '../auth/default-api-client';
import { useOrganization } from '../organization/organization-context';
import { InvalidationCoalescer, type InvalidationCategory } from './invalidation-coalescer';
import { abortableDelay, consumeRealtimeStream, reconnectDelay } from './realtime-client';
import type { RealtimeEventType } from './sse-parser';

export type RealtimeStatus = 'CONNECTING' | 'CONNECTED' | 'DEGRADED';

interface Generations {
  readonly alerts: number;
  readonly monitoring: number;
  readonly dashboard: number;
  readonly selectedAlert: number;
}

interface RealtimeContextValue {
  readonly status: RealtimeStatus;
  readonly generations: Generations;
  invalidate(categories: readonly InvalidationCategory[]): void;
}

const initialGenerations: Generations = {
  alerts: 0,
  monitoring: 0,
  dashboard: 0,
  selectedAlert: 0,
};
const RealtimeContext = createContext<RealtimeContextValue | null>(null);
const realtimeUnavailable: RealtimeContextValue = {
  status: 'CONNECTING',
  generations: initialGenerations,
  invalidate() {},
};

export function RealtimeProvider({ children }: { readonly children: ReactNode }) {
  const auth = useAuth();
  const authStatus = auth.status;
  const organization = useOrganization();
  const [status, setStatus] = useState<RealtimeStatus>('CONNECTING');
  const [generations, setGenerations] = useState<Generations>(initialGenerations);
  const generationRef = useRef(0);
  const coalescerRef = useRef<InvalidationCoalescer | null>(null);
  if (coalescerRef.current === null) {
    coalescerRef.current = new InvalidationCoalescer((category) => {
      setGenerations((current) => ({ ...current, [category]: current[category] + 1 }));
    });
  }

  useEffect(() => {
    const organizationId = organization.activeOrganizationId;
    const api = getDefaultApiClient().client;
    generationRef.current += 1;
    const generation = generationRef.current;
    const controller = new AbortController();
    coalescerRef.current?.clear();
    if (authStatus !== 'authenticated' || organizationId === null || api === null) {
      queueMicrotask(() => {
        if (generationRef.current !== generation) return;
        setGenerations(initialGenerations);
        setStatus('CONNECTING');
      });
      return () => controller.abort();
    }

    queueMicrotask(() => {
      if (generationRef.current !== generation) return;
      setGenerations(initialGenerations);
      setStatus('CONNECTING');
    });

    const run = async () => {
      let attempt = 0;
      while (!controller.signal.aborted && generationRef.current === generation) {
        setStatus(attempt === 0 ? 'CONNECTING' : 'DEGRADED');
        try {
          await consumeRealtimeStream({
            client: api,
            organizationId,
            signal: controller.signal,
            onConnected() {
              if (generationRef.current !== generation) return;
              if (attempt > 0) {
                coalescerRef.current?.schedule([
                  'alerts',
                  'monitoring',
                  'dashboard',
                  'selectedAlert',
                ]);
              }
              setStatus('CONNECTED');
              attempt = 0;
            },
            onEvent(event) {
              if (generationRef.current !== generation) return;
              coalescerRef.current?.schedule(categoriesFor(event.eventType));
            },
          });
        } catch {
          if (controller.signal.aborted || generationRef.current !== generation) return;
        }
        setStatus('DEGRADED');
        try {
          await abortableDelay(reconnectDelay(attempt), controller.signal);
        } catch {
          return;
        }
        attempt += 1;
      }
    };
    void run();
    return () => controller.abort();
  }, [authStatus, organization.activeOrganizationId]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      coalescerRef.current?.clear();
    },
    [],
  );

  const value = useMemo<RealtimeContextValue>(
    () => ({
      status,
      generations,
      invalidate(categories) {
        coalescerRef.current?.schedule(categories);
      },
    }),
    [generations, status],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (context === null) throw new Error('useRealtime harus digunakan di dalam RealtimeProvider.');
  return context;
}

export function useOptionalRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext) ?? realtimeUnavailable;
}

function categoriesFor(eventType: RealtimeEventType): readonly InvalidationCategory[] {
  if (eventType === 'MONITORING_POINT_STATE_CHANGED') return ['monitoring', 'dashboard'];
  if (eventType === 'ALERT_CREATED') return ['alerts', 'monitoring', 'dashboard'];
  if (eventType === 'ALERT_OBSERVED') return ['alerts', 'dashboard', 'selectedAlert'];
  return ['alerts', 'dashboard', 'selectedAlert'];
}
