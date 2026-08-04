import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import { SopQuickAccess } from './sop-quick-access';

describe('Phase 06 SOP quick access', () => {
  it('shows active Site SOP metadata and an authenticated download control', async () => {
    const client = clientForSop();
    render(<SopQuickAccess client={client} organizationId="org-1" siteId="site-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Buka SOP' }));
    expect(await screen.findByText(/<SOP resmi>\.pdf/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Unduh SOP' }));
    expect(client.organizationDownload).toHaveBeenCalledWith(
      '/sop-documents/sop-1/content',
      'org-1',
    );
  });

  it('retains the honest fallback when the Site has no active SOP', async () => {
    const client = clientForSop(true);
    render(<SopQuickAccess client={client} organizationId="org-1" siteId="site-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Buka SOP' }));
    expect(await screen.findByText('SOP resmi belum tersedia pada sistem')).toBeInTheDocument();
  });
});

function clientForSop(
  missing = false,
): OrganizationApiClient & { organizationDownload: ReturnType<typeof vi.fn> } {
  return {
    organizationRequest: vi.fn(async () => {
      if (missing) throw new ApiClientError('missing', 'api', 404);
      return {
        data: {
          id: 'sop-1',
          siteId: 'site-1',
          version: 1,
          title: 'SOP',
          description: null,
          originalFileName: '<SOP resmi>.pdf',
          mediaType: 'application/pdf',
          sizeBytes: 5,
          sha256: 'hash',
          uploadedBy: { id: 'user-1', name: 'Owner' },
          uploadedAt: '2026-01-01T00:00:00.000Z',
          isActive: true,
        },
      };
    }) as unknown as OrganizationApiClient['organizationRequest'],
    organizationDownload: vi
      .fn()
      .mockResolvedValue(new Response(new Blob(['%PDF-']), { status: 200 })),
  };
}
