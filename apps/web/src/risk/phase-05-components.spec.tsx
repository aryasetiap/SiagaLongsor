import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import { RealtimeIndicator } from '../realtime/realtime-indicator';
import { alertFixture } from '../../test/phase-03-fixtures';
import { AlertEventHistory } from './alert-event-history';
import { AlertOperationDialog, SopUnavailable } from './alert-operation-dialog';
import { AlertsManager } from './alerts-manager';
import { acknowledgeAlert, markAlertFalseAlarm, resolveAlert } from './risk-api';
import type { Alert, AlertMutationResponse } from './risk-contracts';

describe('alert lifecycle API', () => {
  it.each([
    [
      'acknowledge',
      acknowledgeAlert,
      { note: 'Diperiksa', fieldCondition: 'Stabil', sopExecuted: true },
    ],
    ['resolve', resolveAlert, { resolutionNote: 'Kondisi selesai diverifikasi' }],
    ['false-alarm', markAlertFalseAlarm, { reason: 'Gangguan sensor terkonfirmasi' }],
  ] as const)(
    'sends %s with matching durable actionId in body and header',
    async (action, call, body) => {
      const client = createClient(async () => mutationResponse(alertFixture));
      const input = { actionId: '10000000-0000-4000-8000-000000000001', ...body };

      await call(client, 'org-1', alertFixture.id, input as never);

      const [path, organizationId, init] = vi.mocked(client.organizationRequest).mock.calls[0]!;
      expect(path).toBe(`/alerts/${alertFixture.id}/${action}`);
      expect(organizationId).toBe('org-1');
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('idempotency-key')).toBe(input.actionId);
      expect(JSON.parse(String(init?.body))).toMatchObject(input);
    },
  );
});

describe('AlertOperationDialog', () => {
  it('validates acknowledge fields and focuses the first field', async () => {
    const client = createClient(async () => mutationResponse(alertFixture));
    renderDialog(client, 'acknowledge');
    expect(screen.getByLabelText('Catatan operator')).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Konfirmasi' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Catatan wajib diisi');
    expect(client.organizationRequest).not.toHaveBeenCalled();
  });

  it('preserves one actionId across a safe network retry and disables duplicate submit', async () => {
    let finish: ((value: unknown) => void) | undefined;
    const client = createClient(
      vi
        .fn()
        .mockRejectedValueOnce(new ApiClientError('offline', 'network'))
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        ),
    );
    const success = vi.fn();
    renderDialog(client, 'acknowledge', success);
    await fillAcknowledge();
    await userEvent.click(screen.getByRole('button', { name: 'Konfirmasi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Aksi belum berhasil');
    await userEvent.click(screen.getByRole('button', { name: 'Konfirmasi' }));
    expect(screen.getByRole('button', { name: 'Menyimpan…' })).toBeDisabled();

    const bodies = vi
      .mocked(client.organizationRequest)
      .mock.calls.map(([, , init]) => JSON.parse(String(init?.body)) as { actionId: string });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]!.actionId).toBe(bodies[1]!.actionId);
    finish?.(mutationResponse({ ...alertFixture, status: 'ACKNOWLEDGED' }));
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
  });

  it.each([
    ['resolve' as const, 'Catatan penyelesaian wajib diisi'],
    ['false-alarm' as const, 'Alasan alarm palsu wajib diisi'],
  ])('validates %s and documents terminal semantics', async (operation, expected) => {
    renderDialog(
      createClient(async () => mutationResponse(alertFixture)),
      operation,
    );
    expect(screen.getByText(/Status ini terminal/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Konfirmasi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(expected);
  });

  it.each([
    ['ALERT_STATE_CONFLICT', 'Peringatan telah berubah'],
    ['IDEMPOTENCY_CONFLICT', 'Permintaan ini berkonflik'],
  ])('handles %s without silently creating a new mutation', async (code, message) => {
    const client = createClient(async () => {
      throw new ApiClientError('conflict', 'api', 409, code);
    });
    const stale = vi.fn();
    renderDialog(client, 'resolve', vi.fn(), stale);
    await userEvent.type(screen.getByLabelText('Catatan penyelesaian'), 'Sudah diverifikasi');
    await userEvent.click(screen.getByRole('button', { name: 'Konfirmasi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(stale).toHaveBeenCalledOnce();
    expect(client.organizationRequest).toHaveBeenCalledOnce();
  });

  it('closes with Escape when no request is active', async () => {
    const close = vi.fn();
    renderDialog(
      createClient(async () => mutationResponse(alertFixture)),
      'resolve',
      vi.fn(),
      vi.fn(),
      close,
    );
    await userEvent.keyboard('{Escape}');
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('honest realtime and SOP presentation', () => {
  it.each([
    ['CONNECTED' as const, 'Realtime aktif'],
    ['CONNECTING' as const, 'Menghubungkan realtime…'],
    ['DEGRADED' as const, 'Realtime terputus — data tetap dapat diperbarui manual'],
  ])('renders %s with an icon and text', (status, text) => {
    render(<RealtimeIndicator status={status} />);
    expect(screen.getByTestId('realtime-indicator')).toHaveTextContent(text);
    expect(screen.queryByText(/perangkat offline/i)).not.toBeInTheDocument();
  });

  it('does not fabricate an SOP', async () => {
    render(<SopUnavailable />);
    await userEvent.click(screen.getByRole('button', { name: 'Buka SOP' }));
    expect(screen.getByText('SOP resmi belum tersedia pada sistem')).toBeInTheDocument();
    expect(screen.queryByText(/evakuasi|hubungi|berlindung/i)).not.toBeInTheDocument();
  });
});

describe('role-aware alert operations and safe history', () => {
  it.each([
    ['PROJECT_OWNER' as const, 'ACTIVE' as const, true, false, true],
    ['SCHOOL_ADMIN' as const, 'ACTIVE' as const, true, false, false],
    ['PROJECT_OWNER' as const, 'ACKNOWLEDGED' as const, false, true, true],
    ['SCHOOL_ADMIN' as const, 'ACKNOWLEDGED' as const, false, false, false],
    ['PROJECT_OWNER' as const, 'RESOLVED' as const, false, false, false],
    ['PROJECT_OWNER' as const, 'FALSE_ALARM' as const, false, false, false],
  ])(
    '%s sees only valid actions for %s',
    async (role, status, canAcknowledge, canResolve, canFalseAlarm) => {
      const alert = { ...alertFixture, status };
      const client = alertClient(alert);
      render(<AlertsManager client={client} organizationId="org-1" role={role} />);
      await userEvent.click(await screen.findByRole('button', { name: 'Lihat detail' }));

      expect(screen.queryByRole('button', { name: 'Konfirmasi peringatan' }) !== null).toBe(
        canAcknowledge,
      );
      expect(screen.queryByRole('button', { name: 'Selesaikan' }) !== null).toBe(canResolve);
      expect(screen.queryByRole('button', { name: 'Tandai alarm palsu' }) !== null).toBe(
        canFalseAlarm,
      );
    },
  );

  it('renders lifecycle events newest-first, paginates, and ignores arbitrary metadata', async () => {
    const eventBase = {
      id: 'event-2',
      eventType: 'ALERT_ACKNOWLEDGED' as const,
      observedAt: null,
      actedAt: '2026-08-01T10:02:00.000Z',
      createdAt: '2026-08-01T10:02:00.000Z',
      actor: { id: 'user-1', name: 'Operator Utama' },
      metadata: { note: 'Sudah dilihat', fieldCondition: 'Stabil', sopExecuted: true },
      riskAssessmentId: null,
      telemetryId: null,
    };
    const client = createClient(async (path: string) =>
      path.includes('cursor=next-event')
        ? {
            data: [
              {
                ...eventBase,
                id: 'event-1',
                eventType: 'ALERT_RESOLVED',
                metadata: { resolutionNote: 'Selesai' },
              },
            ],
            page: { nextCursor: null, hasMore: false },
          }
        : {
            data: [
              {
                ...eventBase,
                metadata: {
                  ...eventBase.metadata,
                  authorization: 'Bearer forbidden',
                  ipAddress: '192.0.2.9',
                },
              },
            ],
            page: { nextCursor: 'next-event', hasMore: true },
          },
    );
    render(
      <AlertEventHistory
        client={client}
        organizationId="org-1"
        alertId="alert-1"
        refreshGeneration={0}
      />,
    );

    expect(await screen.findByText('Sudah dilihat')).toBeInTheDocument();
    expect(screen.getByText(/Operator Utama/)).toBeInTheDocument();
    expect(screen.queryByText(/Bearer forbidden|192\.0\.2\.9/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Muat histori berikutnya' }));
    expect(await screen.findByText('Selesai')).toBeInTheDocument();
  });
});

function renderDialog(
  client: OrganizationApiClient,
  operation: 'acknowledge' | 'resolve' | 'false-alarm',
  onSuccess = vi.fn(),
  onStale = vi.fn(),
  onClose = vi.fn(),
) {
  render(
    <AlertOperationDialog
      client={client}
      organizationId="org-1"
      alert={alertFixture}
      operation={operation}
      onClose={onClose}
      onSuccess={onSuccess}
      onStale={onStale}
    />,
  );
}

async function fillAcknowledge() {
  await userEvent.type(screen.getByLabelText('Catatan operator'), 'Sudah diperiksa');
  await userEvent.type(screen.getByLabelText('Kondisi lapangan'), 'Tidak ada kerusakan terlihat');
  await userEvent.click(screen.getByRole('radio', { name: 'Ya' }));
}

function createClient(
  implementation: (path: string, organizationId: string, init?: RequestInit) => Promise<unknown>,
) {
  return {
    organizationRequest: vi.fn(implementation),
  } as unknown as OrganizationApiClient;
}

function mutationResponse(alert: Alert): AlertMutationResponse {
  return {
    data: alert,
    action: {
      actionId: '10000000-0000-4000-8000-000000000001',
      eventId: 'event-1',
      eventType: 'ALERT_ACKNOWLEDGED',
      previousStatus: 'ACTIVE',
      nextStatus: alert.status,
      actedAt: '2026-08-01T10:00:00.000Z',
      actor: { id: 'user-1', name: 'Operator' },
    },
  };
}

function alertClient(alert: Alert): OrganizationApiClient {
  return createClient(async (path: string) => {
    if (path.startsWith('/sites')) {
      return { data: [], page: { nextCursor: null, hasMore: false } };
    }
    if (path.startsWith('/monitoring-points')) {
      return { data: [], page: { nextCursor: null, hasMore: false } };
    }
    if (path.endsWith('/events')) {
      return { data: [], page: { nextCursor: null, hasMore: false } };
    }
    if (path === `/alerts/${alert.id}`) return { data: alert };
    return { data: [alert], page: { nextCursor: null, hasMore: false } };
  });
}
