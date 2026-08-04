import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import { MapManager } from './map-manager';

describe('Phase 06 Map and SOP', () => {
  it('renders authoritative UNKNOWN for an offline marker and keeps the textual fallback', async () => {
    render(<MapManager client={mapClient()} organizationId="org-1" role="SCHOOL_ADMIN" />);
    expect((await screen.findAllByText(/Titik Offline/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Risiko: Tidak dapat ditentukan/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Legenda' })).toBeInTheDocument();
    expect(screen.getByText('Zona referensi statis')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buka editor' })).not.toBeInTheDocument();
  });

  it('shows the honest unconfigured state', async () => {
    render(
      <MapManager
        client={mapClient({ configured: false })}
        organizationId="org-1"
        role="SCHOOL_ADMIN"
      />,
    );
    expect(await screen.findByText(/belum memiliki konfigurasi peta/)).toBeInTheDocument();
    expect((await screen.findAllByText(/Titik Offline/)).length).toBeGreaterThan(0);
  });

  it('sends expectedVersion from the immutable configuration for an owner save', async () => {
    const client = mapClient();
    render(<MapManager client={client} organizationId="org-1" role="PROJECT_OWNER" />);
    await screen.findAllByText(/Titik Offline/);
    await userEvent.click(screen.getByRole('button', { name: 'Buka editor' }));
    await screen.findByRole('button', { name: 'Simpan konfigurasi' });
    await userEvent.click(screen.getByRole('button', { name: 'Simpan konfigurasi' }));
    await waitFor(() => {
      const call = vi
        .mocked(client.organizationRequest)
        .mock.calls.find(
          ([path, , init]) => path.includes('/map-config') && init?.method === 'PUT',
        );
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[2]?.body))).toMatchObject({ expectedVersion: 3 });
    });
  });

  it('shows loading, renders every risk text, and never changes delayed or offline data to Aman', async () => {
    const pending = deferred<ReturnType<typeof sitePage>>();
    const client = clientFrom(async (path) => {
      if (path.startsWith('/sites?')) return pending.promise;
      return responseFor(path, { risk: 'SAFE', connectivity: 'ONLINE' });
    });
    render(<MapManager client={client} organizationId="org-1" role="SCHOOL_ADMIN" />);
    expect(screen.getByText(/Memuat peta authoritative/)).toBeInTheDocument();
    pending.resolve(sitePage());
    expect(await screen.findByText(/Risiko: Aman/)).toBeInTheDocument();

    for (const [risk, expected] of [
      ['WATCH', 'Waspada'],
      ['DANGER', 'Bahaya'],
      ['UNKNOWN', 'Tidak dapat ditentukan'],
      ['SAFE', 'Tidak dapat ditentukan'],
    ] as const) {
      const next = clientFrom(async (path) =>
        responseFor(path, { risk, connectivity: risk === 'SAFE' ? 'DELAYED' : 'ONLINE' }),
      );
      const view = render(
        <MapManager client={next} organizationId={`org-${risk}`} role="SCHOOL_ADMIN" />,
      );
      expect(await view.findByText(new RegExp(`Risiko: ${expected}`))).toBeInTheDocument();
      view.unmount();
    }
  });

  it('shows an API error and retries to authoritative data', async () => {
    let attempts = 0;
    const client = clientFrom(async (path) => {
      if (path.startsWith('/map/overview') && ++attempts === 1) throw new Error('offline');
      return responseFor(path, {});
    });
    render(<MapManager client={client} organizationId="org-1" role="SCHOOL_ADMIN" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Data peta belum dapat dimuat');
    await userEvent.click(screen.getByRole('button', { name: 'Muat ulang' }));
    expect((await screen.findAllByText(/Titik Offline/)).length).toBeGreaterThan(0);
  });

  it('switches Site and ignores a late result from the old Site', async () => {
    const first = deferred<unknown>();
    const client = clientFrom(async (path) => {
      if (path.startsWith('/sites?')) return sitePage(['site-a', 'site-b']);
      if (path.includes('siteId=site-a')) return first.promise;
      return responseFor(path, { siteId: 'site-b', siteName: 'Site B', pointName: 'Titik B' });
    });
    render(<MapManager client={client} organizationId="org-1" role="SCHOOL_ADMIN" />);
    await screen.findByRole('option', { name: 'site-a' });
    await userEvent.selectOptions(screen.getByLabelText('Site'), 'site-b');
    expect((await screen.findAllByText(/Titik B/)).length).toBeGreaterThan(0);
    first.resolve(
      responseFor('/map/overview', { siteId: 'site-a', siteName: 'Site A', pointName: 'Titik A' }),
    );
    await Promise.resolve();
    expect(screen.queryByText(/Titik A/)).not.toBeInTheDocument();
  });

  it('validates longitude and latitude before a PUT and preserves longitude-first payload', async () => {
    const client = mapClient();
    render(<MapManager client={client} organizationId="org-1" role="PROJECT_OWNER" />);
    await screen.findAllByText(/Titik Offline/);
    await userEvent.click(screen.getByRole('button', { name: 'Buka editor' }));
    await screen.findByRole('button', { name: 'Simpan konfigurasi' });
    const longitude = screen.getByLabelText('Longitude');
    const latitude = screen.getByLabelText('Latitude');
    await userEvent.clear(longitude);
    await userEvent.type(longitude, '-181');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan konfigurasi' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Longitude harus');
    expect(
      vi
        .mocked(client.organizationRequest)
        .mock.calls.filter(([, , init]) => init?.method === 'PUT'),
    ).toHaveLength(0);
    await userEvent.clear(longitude);
    await userEvent.type(longitude, '110.25');
    await userEvent.clear(latitude);
    await userEvent.type(latitude, '-7.75');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan konfigurasi' }));
    await waitFor(() => {
      const call = vi
        .mocked(client.organizationRequest)
        .mock.calls.find(([, , init]) => init?.method === 'PUT');
      expect(JSON.parse(String(call?.[2]?.body))).toMatchObject({
        center: { position: [110.25, -7.75] },
      });
    });
  });

  it('resets to organization B and ignores a late response from organization A', async () => {
    const organizationA = deferred<unknown>();
    const calls: string[] = [];
    const client = clientFrom(async (path, organizationId) => {
      calls.push(`${organizationId}:${path}`);
      if (organizationId === 'org-a') return organizationA.promise;
      return responseFor(path, { siteName: 'Organisasi B', pointName: 'Titik B' });
    });
    const view = render(<MapManager client={client} organizationId="org-a" role="SCHOOL_ADMIN" />);
    await waitFor(() => expect(calls.some((call) => call.startsWith('org-a:/sites?'))).toBe(true));
    view.rerender(<MapManager client={client} organizationId="org-b" role="SCHOOL_ADMIN" />);
    expect((await screen.findAllByText(/Titik B/)).length).toBeGreaterThan(0);
    expect(calls.some((call) => call.startsWith('org-b:/sites?'))).toBe(true);
    organizationA.resolve(sitePage(['old-site']));
    await Promise.resolve();
    expect(screen.queryByRole('option', { name: 'old-site' })).not.toBeInTheDocument();
  });

  it('accepts inclusive coordinate boundaries and rejects every out-of-range boundary', async () => {
    const client = mapClient();
    render(<MapManager client={client} organizationId="org-1" role="PROJECT_OWNER" />);
    await screen.findAllByText(/Titik Offline/);
    await userEvent.click(screen.getByRole('button', { name: 'Buka editor' }));
    const longitude = screen.getByLabelText('Longitude');
    const latitude = screen.getByLabelText('Latitude');
    for (const [lon, lat, valid] of [
      ['-180', '-90', true],
      ['180', '90', true],
      ['-180.01', '0', false],
      ['180.01', '0', false],
      ['0', '-90.01', false],
      ['0', '90.01', false],
    ] as const) {
      await userEvent.clear(longitude);
      await userEvent.type(longitude, lon);
      await userEvent.clear(latitude);
      await userEvent.type(latitude, lat);
      await userEvent.click(screen.getByRole('button', { name: 'Simpan konfigurasi' }));
      if (valid)
        await waitFor(() =>
          expect(
            vi
              .mocked(client.organizationRequest)
              .mock.calls.filter(([, , init]) => init?.method === 'PUT').length,
          ).toBeGreaterThan(0),
        );
      else expect(screen.getByRole('alert')).toHaveTextContent('Longitude harus');
    }
  });

  it('waits for the authoritative successful response before presenting a new version', async () => {
    const put = deferred<unknown>();
    let overviewVersion = 3;
    const client = clientFrom(async (path, _org, init) => {
      if (path.startsWith('/sites?')) return sitePage();
      if (path.startsWith('/map/overview'))
        return {
          data: {
            ...overview(true),
            configuration: { ...overview(true).configuration, version: overviewVersion },
          },
        };
      if (path.endsWith('/sop')) throw new ApiClientError('missing', 'api', 404);
      if (path.includes('/sop/versions'))
        return { data: [], page: { nextCursor: null, hasMore: false } };
      if (path.endsWith('/map-config') && init?.method === 'PUT') return put.promise;
      if (path.endsWith('/map-config')) return { data: configuration() };
      throw new Error(path);
    });
    render(<MapManager client={client} organizationId="org-1" role="PROJECT_OWNER" />);
    await screen.findAllByText(/Titik Offline/);
    await userEvent.click(screen.getByRole('button', { name: 'Buka editor' }));
    await userEvent.clear(screen.getByLabelText('Catatan'));
    await userEvent.type(screen.getByLabelText('Catatan'), 'authoritative');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan konfigurasi' }));
    expect(screen.queryByText(/Versi 4 telah disimpan/)).not.toBeInTheDocument();
    overviewVersion = 4;
    put.resolve({
      data: { ...configuration(), version: 4, notes: 'authoritative' },
      changed: true,
    });
    expect(await screen.findByText('Versi 4 telah disimpan.')).toBeInTheDocument();
  });

  it('refetches after MAP_CONFIG_VERSION_CONFLICT and never replays the stale PUT', async () => {
    let configGets = 0;
    let puts = 0;
    const client = clientFrom(async (path, _org, init) => {
      if (path.startsWith('/sites?')) return sitePage();
      if (path.startsWith('/map/overview')) return { data: overview(true) };
      if (path.endsWith('/sop')) throw new ApiClientError('missing', 'api', 404);
      if (path.includes('/sop/versions'))
        return { data: [], page: { nextCursor: null, hasMore: false } };
      if (path.endsWith('/map-config') && init?.method === 'PUT') {
        puts += 1;
        throw new ApiClientError('stale', 'api', 409, 'MAP_CONFIG_VERSION_CONFLICT');
      }
      if (path.endsWith('/map-config')) {
        configGets += 1;
        return { data: { ...configuration(), version: configGets === 1 ? 3 : 4 } };
      }
      throw new Error(path);
    });
    render(<MapManager client={client} organizationId="org-1" role="PROJECT_OWNER" />);
    await screen.findAllByText(/Titik Offline/);
    await userEvent.click(screen.getByRole('button', { name: 'Buka editor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Simpan konfigurasi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Konfigurasi telah berubah');
    await waitFor(() => expect(configGets).toBe(2));
    expect(puts).toBe(1);
  });

  it('reports canonical changed:false honestly without inventing a new version', async () => {
    const client = mapClient();
    render(<MapManager client={client} organizationId="org-1" role="PROJECT_OWNER" />);
    await screen.findAllByText(/Titik Offline/);
    await userEvent.click(screen.getByRole('button', { name: 'Buka editor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Simpan konfigurasi' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Tidak ada versi baru: konfigurasi identik (versi 3).',
    );
    expect(screen.queryByText(/Versi 4 telah disimpan/)).not.toBeInTheDocument();
  });

  it('renders active SOP as escaped text and keeps upload controls owner-only', async () => {
    const client = sopClient();
    const owner = render(
      <MapManager client={client} organizationId="org-1" role="PROJECT_OWNER" />,
    );
    expect(
      (await screen.findAllByText(/<script>alert\("x"\)<\/script>\.pdf/)).length,
    ).toBeGreaterThan(0);
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByLabelText('Unggah SOP PDF (maks. 10 MiB)')).toBeInTheDocument();
    owner.unmount();
    const admin = render(
      <MapManager client={sopClient()} organizationId="org-2" role="SCHOOL_ADMIN" />,
    );
    expect((await admin.findAllByText(/<script>alert/)).length).toBeGreaterThan(0);
    expect(admin.queryByLabelText('Unggah SOP PDF (maks. 10 MiB)')).toBeNull();
    admin.unmount();
  });

  it('requires explicit valid PDF submit, then refetches active SOP and history', async () => {
    const client = sopClient();
    render(<MapManager client={client} organizationId="org-1" role="PROJECT_OWNER" />);
    await screen.findAllByText(/<script>alert/);
    const fileInput = screen.getByLabelText('Unggah SOP PDF (maks. 10 MiB)');
    await userEvent.upload(fileInput, new File(['not-pdf'], 'notes.txt', { type: 'text/plain' }), {
      applyAccept: false,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Konfirmasi unggah versi aktif' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pilih berkas PDF');
    expect(postCalls(client)).toBe(0);
    await userEvent.upload(
      fileInput,
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Konfirmasi unggah versi aktif' }));
    expect(screen.getByRole('alert')).toHaveTextContent('maksimal 10 MiB');
    expect(postCalls(client)).toBe(0);
    await userEvent.upload(fileInput, new File(['%PDF-'], 'safe.pdf', { type: 'application/pdf' }));
    expect(postCalls(client)).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Konfirmasi unggah versi aktif' }));
    await waitFor(() => expect(postCalls(client)).toBe(1));
    expect(await screen.findByText('safe.pdf')).toBeInTheDocument();
    expect(historyCalls(client)).toBeGreaterThan(1);
  });

  it('appends authoritative SOP history with the exact cursor and leaves Load More absent at end', async () => {
    const client = sopClient({ cursor: 'cursor-1' });
    render(<MapManager client={client} organizationId="org-1" role="SCHOOL_ADMIN" />);
    expect(await screen.findByText('Riwayat versi')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Muat lebih banyak' }));
    expect(await screen.findByText('older.pdf')).toBeInTheDocument();
    expect(
      vi
        .mocked(client.organizationRequest)
        .mock.calls.some(([path]) => path.includes('cursor=cursor-1')),
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Muat lebih banyak' })).toBeNull();
  });

  it('shows actionable SOP download failure without creating a public URL', async () => {
    const client = sopClient();
    client.organizationDownload = vi.fn().mockRejectedValue(new Error('network'));
    render(<MapManager client={client} organizationId="org-1" role="SCHOOL_ADMIN" />);
    await screen.findAllByText(/<script>alert/);
    await userEvent.click(screen.getAllByRole('button', { name: 'Unduh SOP' })[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent('SOP belum dapat diunduh');
    expect(client.organizationDownload).toHaveBeenCalledWith(
      '/sop-documents/sop-1/content',
      'org-1',
    );
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function sitePage(ids = ['site-1']) {
  return {
    data: ids.map((id) => ({ id, name: id, address: null, timezone: 'Asia/Jakarta' })),
    page: { nextCursor: null, hasMore: false },
  };
}
function clientFrom(
  implementation: (path: string, organizationId: string, init?: RequestInit) => Promise<unknown>,
): OrganizationApiClient {
  return {
    organizationRequest: vi.fn(
      implementation,
    ) as unknown as OrganizationApiClient['organizationRequest'],
  };
}
async function responseFor(
  path: string,
  options: {
    readonly risk?: 'SAFE' | 'WATCH' | 'DANGER' | 'UNKNOWN';
    readonly connectivity?: 'ONLINE' | 'OFFLINE' | 'DELAYED' | 'UNKNOWN';
    readonly siteId?: string;
    readonly siteName?: string;
    readonly pointName?: string;
  },
) {
  if (path.startsWith('/sites?')) return sitePage();
  if (path.startsWith('/map/overview')) return { data: overviewFor(options) };
  if (path.includes('/sop/versions'))
    return { data: [], page: { nextCursor: null, hasMore: false } };
  if (path.endsWith('/sop')) throw new ApiClientError('not found', 'api', 404);
  if (path.endsWith('/map-config')) return { data: configuration() };
  throw new Error(`Unexpected request ${path}`);
}
function overviewFor(options: {
  readonly risk?: 'SAFE' | 'WATCH' | 'DANGER' | 'UNKNOWN';
  readonly connectivity?: 'ONLINE' | 'OFFLINE' | 'DELAYED' | 'UNKNOWN';
  readonly siteId?: string;
  readonly siteName?: string;
  readonly pointName?: string;
}) {
  const value = overview(true);
  return {
    ...value,
    site: {
      ...value.site,
      id: options.siteId ?? value.site.id,
      name: options.siteName ?? value.site.name,
    },
    markers: value.markers.map((marker) => ({
      ...marker,
      monitoringPoint: {
        ...marker.monitoringPoint,
        name: options.pointName ?? marker.monitoringPoint.name,
      },
      currentState: {
        ...marker.currentState!,
        serverRisk: options.risk ?? marker.currentState!.serverRisk,
        connectivityStatus: options.connectivity ?? marker.currentState!.connectivityStatus,
      },
    })),
  };
}

function sopClient(
  options: { readonly cursor?: string } = {},
): OrganizationApiClient & { organizationDownload?: ReturnType<typeof vi.fn> } {
  let uploaded = false;
  let historyReads = 0;
  const organizationRequest = vi.fn(
    async (path: string, _organizationId: string, init?: RequestInit) => {
      if (path.startsWith('/sites?')) return sitePage();
      if (path.startsWith('/map/overview')) return { data: overview(true) };
      if (path === '/sites/site-1/sop' && init?.method === 'POST') {
        uploaded = true;
        return { data: sopDocument('safe.pdf', 2) };
      }
      if (path === '/sites/site-1/sop')
        return {
          data: uploaded
            ? sopDocument('safe.pdf', 2)
            : sopDocument('<script>alert("x")</script>.pdf', options.cursor ? 2 : 1),
        };
      if (path.startsWith('/sites/site-1/sop/versions')) {
        historyReads += 1;
        return path.includes('cursor=')
          ? { data: [sopDocument('older.pdf', 1)], page: { nextCursor: null, hasMore: false } }
          : {
              data: [
                uploaded
                  ? sopDocument('safe.pdf', 2)
                  : sopDocument('<script>alert("x")</script>.pdf', options.cursor ? 2 : 1),
              ],
              page: { nextCursor: options.cursor ?? null, hasMore: options.cursor !== undefined },
            };
      }
      if (path.endsWith('/map-config')) return { data: configuration() };
      throw new Error(path);
    },
  ) as unknown as OrganizationApiClient['organizationRequest'];
  const client: OrganizationApiClient & { organizationDownload?: ReturnType<typeof vi.fn> } = {
    organizationRequest,
    organizationDownload: vi
      .fn()
      .mockResolvedValue(new Response(new Blob(['%PDF-']), { status: 200 })),
  };
  Object.defineProperty(client, '__historyReads', { value: () => historyReads });
  return client;
}
function sopDocument(originalFileName: string, version: number) {
  return {
    id: `sop-${version}`,
    siteId: 'site-1',
    version,
    title: 'SOP',
    description: null,
    originalFileName,
    mediaType: 'application/pdf',
    sizeBytes: 5,
    sha256: 'hash',
    uploadedBy: { id: 'owner', name: 'Owner' },
    uploadedAt: '2026-01-01T00:00:00.000Z',
    isActive: true,
  };
}
function postCalls(client: OrganizationApiClient): number {
  return vi
    .mocked(client.organizationRequest)
    .mock.calls.filter(([, , init]) => init?.method === 'POST').length;
}
function historyCalls(client: OrganizationApiClient): number {
  return vi
    .mocked(client.organizationRequest)
    .mock.calls.filter(([path]) => path.includes('/sop/versions')).length;
}

function mapClient(options: { readonly configured?: boolean } = {}): OrganizationApiClient {
  const configured = options.configured ?? true;
  return {
    organizationRequest: vi.fn(
      async (path: string, _organizationId: string, init?: RequestInit) => {
        if (path.startsWith('/sites?'))
          return {
            data: [
              { id: 'site-1', name: 'Sekolah Utama', address: null, timezone: 'Asia/Jakarta' },
            ],
            page: { nextCursor: null, hasMore: false },
          };
        if (path.startsWith('/map/overview')) return { data: overview(configured) };
        if (path === '/sites/site-1/sop') throw new ApiClientError('not found', 'api', 404);
        if (path.startsWith('/sites/site-1/sop/versions'))
          return { data: [], page: { nextCursor: null, hasMore: false } };
        if (path === '/sites/site-1/map-config' && init?.method === 'PUT')
          return { data: configuration(), changed: false };
        if (path === '/sites/site-1/map-config') return { data: configuration() };
        throw new Error(`Unexpected request ${path}`);
      },
    ) as unknown as OrganizationApiClient['organizationRequest'],
  };
}

function overview(configured: boolean) {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    site: { id: 'site-1', name: 'Sekolah Utama', timezone: 'Asia/Jakarta' },
    configuration: {
      configured,
      version: configured ? 3 : null,
      center: configured ? { position: [110, -7], zoom: 15 } : null,
      riskZones: configured
        ? [
            {
              featureId: '11111111-1111-4111-8111-111111111111',
              name: 'Zona A',
              description: null,
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [110, -7],
                    [110.01, -7],
                    [110, -7.01],
                    [110, -7],
                  ],
                ],
              },
            },
          ]
        : [],
      evacuationRoutes: [],
    },
    markers: [
      {
        monitoringPoint: {
          id: 'point-1',
          name: 'Titik Offline',
          locationDescription: 'Lereng utara',
          isActive: true,
        },
        position: [110, -7],
        currentState: {
          serverRisk: 'SAFE',
          connectivityStatus: 'OFFLINE',
          evaluatedAt: '2026-01-01T00:00:00.000Z',
          lastTelemetryAt: null,
        },
      },
    ],
    sop: { available: false, documentId: null, version: null, title: null },
  };
}

function configuration() {
  return {
    id: 'config-1',
    siteId: 'site-1',
    version: 3,
    center: { position: [110, -7], zoom: 15 },
    monitoringPointLocations: [{ monitoringPointId: 'point-1', position: [110, -7] }],
    riskZones: [],
    evacuationRoutes: [],
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    activatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: { id: 'user-1', name: 'Owner' },
  };
}
