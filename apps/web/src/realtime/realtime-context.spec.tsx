import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authStatus: 'authenticated' as 'authenticated' | 'unauthenticated',
  organizationId: 'org-old' as string | null,
  streamInputs: [] as Array<{
    organizationId: string;
    signal: AbortSignal;
    onConnected: () => void;
    onEvent: (event: {
      eventId: string;
      eventType: 'ALERT_CREATED';
      occurredAt: string;
      siteId: string;
      monitoringPointId: string;
      alertId: string;
    }) => void;
  }>,
  consumeImplementation: null as null | ((input: never) => Promise<void>),
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({ status: state.authStatus }),
}));
vi.mock('../auth/default-api-client', () => ({
  getDefaultApiClient: () => ({ client: {} }),
}));
vi.mock('../organization/organization-context', () => ({
  useOrganization: () => ({ activeOrganizationId: state.organizationId }),
}));
vi.mock('./realtime-client', () => ({
  consumeRealtimeStream: vi.fn((input: never) => state.consumeImplementation!(input)),
  reconnectDelay: vi.fn(() => 0),
  abortableDelay: vi.fn(async () => undefined),
}));

import { RealtimeProvider, useRealtime } from './realtime-context';

afterEach(() => {
  state.authStatus = 'authenticated';
  state.organizationId = 'org-old';
  state.streamInputs = [];
  state.consumeImplementation = null;
  vi.clearAllMocks();
});

describe('RealtimeProvider', () => {
  it('aborts the old organization stream and ignores a late old-scope event', async () => {
    state.consumeImplementation = (rawInput) => {
      const input = rawInput as (typeof state.streamInputs)[number];
      state.streamInputs.push(input);
      return new Promise((_resolve, reject) => {
        input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true });
      });
    };
    const view = render(
      <RealtimeProvider>
        <Probe />
      </RealtimeProvider>,
    );
    await waitFor(() => expect(state.streamInputs).toHaveLength(1));
    act(() => state.streamInputs[0]!.onConnected());
    expect(screen.getByTestId('status')).toHaveTextContent('CONNECTED');

    state.organizationId = 'org-new';
    view.rerender(
      <RealtimeProvider>
        <Probe />
      </RealtimeProvider>,
    );
    await waitFor(() => expect(state.streamInputs).toHaveLength(2));
    expect(state.streamInputs[0]!.signal.aborted).toBe(true);
    expect(state.streamInputs[1]!.organizationId).toBe('org-new');

    act(() => state.streamInputs[0]!.onEvent(realtimeEvent('old-event')));
    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(screen.getByTestId('alerts-generation')).toHaveTextContent('0');
    act(() => state.streamInputs[1]!.onEvent(realtimeEvent('new-event')));
    await waitFor(() => expect(screen.getByTestId('alerts-generation')).toHaveTextContent('1'), {
      timeout: 1_000,
    });

    view.unmount();
    expect(state.streamInputs[1]!.signal.aborted).toBe(true);
  });

  it('enters degraded state and invalidates authoritative REST categories after reconnect', async () => {
    let call = 0;
    state.consumeImplementation = async (rawInput) => {
      const input = rawInput as (typeof state.streamInputs)[number];
      state.streamInputs.push(input);
      call += 1;
      if (call === 1) {
        input.onConnected();
        throw new Error('stream disconnected');
      }
      return new Promise((_resolve, reject) => {
        input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true });
      });
    };
    const view = render(
      <RealtimeProvider>
        <Probe />
      </RealtimeProvider>,
    );
    await waitFor(() => expect(state.streamInputs).toHaveLength(2));
    expect(screen.getByTestId('status')).toHaveTextContent('DEGRADED');
    act(() => state.streamInputs[1]!.onConnected());
    expect(screen.getByTestId('status')).toHaveTextContent('CONNECTED');
    await waitFor(() => expect(screen.getByTestId('dashboard-generation')).toHaveTextContent('1'), {
      timeout: 1_000,
    });
    expect(screen.getByTestId('monitoring-generation')).toHaveTextContent('1');
    expect(screen.getByTestId('alerts-generation')).toHaveTextContent('1');
    expect(screen.getByTestId('selected-alert-generation')).toHaveTextContent('1');
    view.unmount();
  });
});

function Probe() {
  const realtime = useRealtime();
  return (
    <>
      <span data-testid="status">{realtime.status}</span>
      <span data-testid="alerts-generation">{realtime.generations.alerts}</span>
      <span data-testid="monitoring-generation">{realtime.generations.monitoring}</span>
      <span data-testid="dashboard-generation">{realtime.generations.dashboard}</span>
      <span data-testid="selected-alert-generation">{realtime.generations.selectedAlert}</span>
    </>
  );
}

function realtimeEvent(eventId: string) {
  return {
    eventId,
    eventType: 'ALERT_CREATED' as const,
    occurredAt: '2026-08-01T10:00:00.000Z',
    siteId: 'site-1',
    monitoringPointId: 'point-1',
    alertId: 'alert-1',
  };
}
