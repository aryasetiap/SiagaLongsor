import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OrganizationApiClient } from '../api/contracts';
import { AuditLogManager } from './audit-log-manager';
import type { AuditLogEntry } from './audit-contracts';

const firstEntry: AuditLogEntry = {
  id: 'audit-1',
  eventType: 'ALERT_ACKNOWLEDGED',
  entityType: 'Alert',
  entityId: 'alert-1',
  actor: { id: 'user-1', name: 'Operator Utama' },
  requestId: 'request-1',
  metadata: {
    note: 'Kondisi telah diperiksa',
    fieldCondition: 'Stabil',
    sopExecuted: true,
  },
  createdAt: '2026-08-01T10:00:00.000Z',
};

describe('AuditLogManager', () => {
  it('renders only the sanitized projection and never transport metadata', async () => {
    const unsafeResponse = {
      ...firstEntry,
      metadata: {
        ...firstEntry.metadata,
        ipAddress: '192.0.2.1',
        userAgent: 'Sensitive Browser Agent',
        authorization: 'Bearer forbidden',
      },
    };
    const client = createClient(async () => ({
      data: [unsafeResponse],
      page: { nextCursor: null, hasMore: false },
    }));
    render(<AuditLogManager client={client} organizationId="org-1" />);

    expect(await screen.findByText('Kondisi telah diperiksa')).toBeInTheDocument();
    expect(screen.getByText('Operator Utama')).toBeInTheDocument();
    expect(
      screen.queryByText(/192\.0\.2\.1|Sensitive Browser Agent|Bearer forbidden/),
    ).not.toBeInTheDocument();
  });

  it('applies and resets filters using organization-scoped cursor requests', async () => {
    const client = createClient(async () => ({
      data: [],
      page: { nextCursor: null, hasMore: false },
    }));
    render(<AuditLogManager client={client} organizationId="org-1" />);
    await screen.findByText('Belum ada audit log yang sesuai.');

    await userEvent.type(screen.getByLabelText('Jenis event'), 'ALERT_RESOLVED');
    await userEvent.type(screen.getByLabelText('Jenis entitas'), 'Alert');
    await userEvent.type(screen.getByLabelText('ID aktor'), 'user-1');
    await userEvent.click(screen.getByRole('button', { name: 'Terapkan' }));

    await waitFor(() => {
      const path = String(vi.mocked(client.organizationRequest).mock.calls.at(-1)?.[0]);
      expect(path).toContain('eventType=ALERT_RESOLVED');
      expect(path).toContain('entityType=Alert');
      expect(path).toContain('actorId=user-1');
    });
    expect(vi.mocked(client.organizationRequest).mock.calls.at(-1)?.[1]).toBe('org-1');

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Jenis event')).toHaveValue('');
  });

  it('loads the next cursor page without exposing totalCount', async () => {
    const client = createClient(async (path) =>
      String(path).includes('cursor=next-audit')
        ? {
            data: [{ ...firstEntry, id: 'audit-2', eventType: 'ALERT_RESOLVED' }],
            page: { nextCursor: null, hasMore: false },
          }
        : { data: [firstEntry], page: { nextCursor: 'next-audit', hasMore: true } },
    );
    render(<AuditLogManager client={client} organizationId="org-1" />);
    await screen.findByText('Kondisi telah diperiksa');
    await userEvent.click(screen.getByRole('button', { name: 'Muat berikutnya' }));

    expect(await screen.findByText('Alert resolved')).toBeInTheDocument();
    expect(screen.queryByText(/totalCount/i)).not.toBeInTheDocument();
  });
});

function createClient(implementation: (path: string) => Promise<unknown>) {
  return {
    organizationRequest: vi.fn(implementation),
  } as unknown as OrganizationApiClient;
}
