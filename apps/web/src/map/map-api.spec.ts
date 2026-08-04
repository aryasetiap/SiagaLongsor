import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrganizationApiClient } from '../api/contracts';
import { downloadSop } from './map-api';

describe('SOP authenticated download', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the organization-scoped binary client, triggers a Blob download, and revokes the temporary URL', async () => {
    const organizationDownload = vi
      .fn()
      .mockResolvedValue(
        new Response(new Blob(['%PDF-'], { type: 'application/pdf' }), { status: 200 }),
      );
    const client: OrganizationApiClient = {
      organizationRequest: vi.fn() as unknown as OrganizationApiClient['organizationRequest'],
      organizationDownload,
    };
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:temporary-sop');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.useFakeTimers();

    await downloadSop(client, 'org-1', documentFixture());
    expect(organizationDownload).toHaveBeenCalledWith('/sop-documents/sop-1/content', 'org-1');
    expect(create).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect(revoke).toHaveBeenCalledWith('blob:temporary-sop');
    vi.useRealTimers();
  });

  it('does not use a public URL when the authenticated binary client is unavailable', async () => {
    await expect(
      downloadSop(
        { organizationRequest: vi.fn() as unknown as OrganizationApiClient['organizationRequest'] },
        'org-1',
        documentFixture(),
      ),
    ).rejects.toThrow('Authenticated download');
  });
});

function documentFixture() {
  return {
    id: 'sop-1',
    siteId: 'site-1',
    version: 1,
    title: 'SOP',
    description: null,
    originalFileName: '<sop>.pdf',
    mediaType: 'application/pdf' as const,
    sizeBytes: 5,
    sha256: 'hash',
    uploadedBy: { id: 'user-1', name: 'Owner' },
    uploadedAt: '2026-01-01T00:00:00.000Z',
    isActive: true,
  };
}
