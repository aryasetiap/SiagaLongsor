import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import { monitoringPointFixture, siteFixture } from '../../test/phase-02-fixtures';
import type { MonitoringPoint } from './monitoring-point-contracts';
import { MonitoringPointsManager } from './monitoring-points-manager';

const organizationId = monitoringPointFixture.organizationId;
const emptyPage = { data: [], page: { nextCursor: null, hasMore: false } };
const sitePage = { data: [siteFixture], page: { nextCursor: null, hasMore: false } };

describe('MonitoringPointsManager', () => {
  it('shows loading, then the initial empty state', async () => {
    let finishList: ((value: unknown) => void) | undefined;
    const client = createClient((path) => {
      if (path.startsWith('/sites')) return Promise.resolve(sitePage);
      return new Promise((resolve) => {
        finishList = resolve;
      });
    });

    renderManager(client);
    expect(screen.getByText('Memuat titik monitoring…')).toBeInTheDocument();

    finishList?.(emptyPage);
    expect(await screen.findByText('Belum ada titik monitoring')).toBeInTheDocument();
  });

  it('distinguishes filtered empty results from the initial empty state', async () => {
    const handler = vi.fn(async (path: string) =>
      path.startsWith('/sites') ? sitePage : emptyPage,
    );
    renderManager(createClient(handler));
    await screen.findByText('Belum ada titik monitoring');

    await userEvent.type(screen.getByLabelText('Cari'), 'barat');
    await userEvent.click(screen.getByRole('button', { name: 'Terapkan' }));

    expect(await screen.findByText('Tidak ada hasil yang sesuai')).toBeInTheDocument();
    expect(handler.mock.calls.some(([path]) => String(path).includes('search=barat'))).toBe(true);
  });

  it('shows request ID and retries an API error', async () => {
    let listCalls = 0;
    const client = createClient(async (path) => {
      if (path.startsWith('/sites')) return sitePage;
      listCalls += 1;
      if (listCalls === 1) {
        throw new ApiClientError('Gagal.', 'api', 503, 'SERVICE_UNAVAILABLE', 'req-monitoring-1');
      }
      return { data: [monitoringPointFixture], page: { nextCursor: null, hasMore: false } };
    });

    renderManager(client);
    expect(await screen.findByText('Request ID: req-monitoring-1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));

    expect(await screen.findByText(monitoringPointFixture.name)).toBeInTheDocument();
    expect(listCalls).toBe(2);
  });

  it('renders Site and current Device and merges cursor pages without duplicates', async () => {
    const secondPoint: MonitoringPoint = {
      ...monitoringPointFixture,
      id: 'mp-second',
      name: 'Titik Kedua',
      currentDevice: null,
    };
    const client = createClient(async (path) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path.includes('cursor=next-page')) {
        return {
          data: [monitoringPointFixture, secondPoint],
          page: { nextCursor: null, hasMore: false },
        };
      }
      return {
        data: [
          {
            ...monitoringPointFixture,
            credentialHash: 'HASH_MUST_NOT_RENDER',
          },
        ],
        page: { nextCursor: 'next-page', hasMore: true },
      };
    });

    renderManager(client);
    expect((await screen.findAllByText(siteFixture.name)).length).toBeGreaterThan(0);
    expect(
      screen.getByText(monitoringPointFixture.currentDevice?.hardwareId ?? ''),
    ).toBeInTheDocument();
    expect(screen.queryByText('HASH_MUST_NOT_RENDER')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Muat lebih banyak' }));
    expect(await screen.findByText(secondPoint.name)).toBeInTheDocument();
    expect(screen.getAllByText(monitoringPointFixture.name)).toHaveLength(1);
  });

  it('drops old organization data while the next organization loads', async () => {
    let finishSecond: ((value: unknown) => void) | undefined;
    const client = createClient((path, requestedOrganizationId) => {
      if (path.startsWith('/sites')) return Promise.resolve(sitePage);
      if (requestedOrganizationId === 'org-second') {
        return new Promise((resolve) => {
          finishSecond = resolve;
        });
      }
      return Promise.resolve({
        data: [monitoringPointFixture],
        page: { nextCursor: null, hasMore: false },
      });
    });
    const view = renderManager(client);
    await screen.findByText(monitoringPointFixture.name);

    view.rerender(
      <MonitoringPointsManager client={client} organizationId="org-second" role="PROJECT_OWNER" />,
    );
    expect(screen.queryByText(monitoringPointFixture.name)).not.toBeInTheDocument();
    expect(screen.getByText('Memuat titik monitoring…')).toBeInTheDocument();

    finishSecond?.({
      data: [{ ...monitoringPointFixture, id: 'mp-new-org', name: 'Titik Organisasi Baru' }],
      page: { nextCursor: null, hasMore: false },
    });
    expect(await screen.findByText('Titik Organisasi Baru')).toBeInTheDocument();
  });

  it.each([
    ['PROJECT_OWNER' as const, true],
    ['SCHOOL_ADMIN' as const, false],
  ])('applies mutation controls for %s', async (role, canMutate) => {
    const client = createClient(async (path) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path === `/monitoring-points/${monitoringPointFixture.id}`) {
        return { data: monitoringPointFixture };
      }
      return {
        data: [monitoringPointFixture],
        page: { nextCursor: null, hasMore: false },
      };
    });
    renderManager(client, role);
    await screen.findByText(monitoringPointFixture.name);

    if (canMutate) {
      expect(screen.getByRole('button', { name: 'Tambah titik monitoring' })).toBeInTheDocument();
    } else {
      expect(
        screen.queryByRole('button', { name: 'Tambah titik monitoring' }),
      ).not.toBeInTheDocument();
    }

    await userEvent.click(
      screen.getByRole('button', { name: `Lihat detail ${monitoringPointFixture.name}` }),
    );
    await screen.findByText('Detail titik monitoring');
    expect(screen.queryByRole('button', { name: 'Edit' }) !== null).toBe(canMutate);
    expect(screen.queryByRole('button', { name: 'Nonaktifkan' }) !== null).toBe(canMutate);
  });

  it('validates create, uses the Site API ID, creates, and reloads the first page', async () => {
    const handler = vi.fn(async (path: string, _organization: string, init?: RequestInit) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path === '/monitoring-points' && init?.method === 'POST') {
        return { data: { ...monitoringPointFixture, name: 'Titik Baru' } };
      }
      return emptyPage;
    });
    renderManager(createClient(handler));
    await screen.findByText('Belum ada titik monitoring');
    await userEvent.click(screen.getByRole('button', { name: 'Tambah titik monitoring' }));

    await screen.findByRole('dialog', { name: 'Tambah titik monitoring' });
    await userEvent.click(screen.getByRole('button', { name: 'Simpan titik monitoring' }));
    expect(screen.getByText('Site wajib dipilih.')).toBeInTheDocument();
    expect(screen.getByText('Nama wajib diisi.')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Pilih Site'), siteFixture.id);
    await userEvent.type(screen.getByLabelText('Nama titik monitoring'), '  Titik Baru  ');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan titik monitoring' }));

    expect(await screen.findByText('Titik monitoring berhasil ditambahkan.')).toBeInTheDocument();
    const createCall = handler.mock.calls.find(([, , init]) => init?.method === 'POST');
    expect(createCall?.[0]).toBe('/monitoring-points');
    expect(JSON.parse(String(createCall?.[2]?.body))).toMatchObject({
      siteId: siteFixture.id,
      name: 'Titik Baru',
    });
    expect(
      handler.mock.calls.filter(([path, , init]) => path.startsWith('/monitoring-points?') && !init)
        .length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('maps backend validation details to the related create field', async () => {
    const client = createClient(async (path, _organization, init) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path === '/monitoring-points' && init?.method === 'POST') {
        throw new ApiClientError('Payload tidak valid.', 'api', 400, 'VALIDATION_ERROR', 'req-2', [
          { field: 'body.name', messages: ['Nama telah digunakan.'] },
        ]);
      }
      return emptyPage;
    });
    renderManager(client);
    await screen.findByText('Belum ada titik monitoring');
    await userEvent.click(screen.getByRole('button', { name: 'Tambah titik monitoring' }));
    await userEvent.selectOptions(await screen.findByLabelText('Pilih Site'), siteFixture.id);
    await userEvent.type(screen.getByLabelText('Nama titik monitoring'), 'Titik Duplikat');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan titik monitoring' }));

    expect(await screen.findByText('Nama telah digunakan.')).toBeInTheDocument();
  });

  it('edits a point and reloads without misleading optimistic data', async () => {
    const handler = vi.fn(async (path: string, _organization: string, init?: RequestInit) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path === `/monitoring-points/${monitoringPointFixture.id}` && init?.method === 'PATCH') {
        return { data: { ...monitoringPointFixture, name: 'Nama Diperbarui' } };
      }
      if (path === `/monitoring-points/${monitoringPointFixture.id}`) {
        return { data: monitoringPointFixture };
      }
      return {
        data: [monitoringPointFixture],
        page: { nextCursor: null, hasMore: false },
      };
    });
    renderManager(createClient(handler));
    await openDetail();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const name = screen.getByLabelText('Nama titik monitoring');
    await userEvent.clear(name);
    await userEvent.type(name, 'Nama Diperbarui');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }));

    expect(await screen.findByText('Data titik monitoring tersimpan.')).toBeInTheDocument();
    const updateCall = handler.mock.calls.find(([, , init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(updateCall?.[2]?.body))).toMatchObject({ name: 'Nama Diperbarui' });
  });

  it('confirms deactivation and gives the active-device conflict message', async () => {
    const client = createClient(async (path, _organization, init) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path === `/monitoring-points/${monitoringPointFixture.id}` && init?.method === 'PATCH') {
        throw new ApiClientError(
          'Conflict.',
          'api',
          409,
          'MONITORING_POINT_ACTIVE_DEVICE_CONFLICT',
          'req-conflict',
        );
      }
      if (path === `/monitoring-points/${monitoringPointFixture.id}`) {
        return { data: monitoringPointFixture };
      }
      return {
        data: [monitoringPointFixture],
        page: { nextCursor: null, hasMore: false },
      };
    });
    renderManager(client);
    await openDetail();
    await userEvent.click(screen.getByRole('button', { name: 'Nonaktifkan' }));

    expect(
      screen.getByRole('alertdialog', { name: 'Nonaktifkan titik monitoring?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/histori tetap tersedia/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ya, nonaktifkan' }));
    expect(
      await screen.findByText('Nonaktifkan atau pindahkan perangkat aktif terlebih dahulu.'),
    ).toBeInTheDocument();
  });
});

function renderManager(
  client: OrganizationApiClient,
  role: 'PROJECT_OWNER' | 'SCHOOL_ADMIN' = 'PROJECT_OWNER',
) {
  return render(
    <MonitoringPointsManager client={client} organizationId={organizationId} role={role} />,
  );
}

async function openDetail(): Promise<void> {
  await screen.findByText(monitoringPointFixture.name);
  await userEvent.click(
    screen.getByRole('button', { name: `Lihat detail ${monitoringPointFixture.name}` }),
  );
  await screen.findByText('Detail titik monitoring');
}

type Handler = (path: string, organizationId: string, init?: RequestInit) => Promise<unknown>;

function createClient(handler: Handler): OrganizationApiClient {
  return {
    async organizationRequest<T>(
      path: string,
      requestedOrganizationId: string,
      init?: RequestInit,
    ): Promise<T> {
      return (await handler(path, requestedOrganizationId, init)) as T;
    },
  };
}
