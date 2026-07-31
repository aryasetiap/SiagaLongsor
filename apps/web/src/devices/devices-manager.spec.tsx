import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  deviceFixture,
  deviceRegisterFixture,
  monitoringPointFixture,
  rotateCredentialFixture,
  siteFixture,
} from '../../test/phase-02-fixtures';
import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import type { Role } from '../auth/auth-types';
import type { Device } from './device-contracts';
import { safeMutationError } from './device-register-dialog';
import { DevicesManager } from './devices-manager';
import { OneTimeCredentialDialog } from './one-time-credential-dialog';

const organizationId = deviceFixture.organizationId;
const emptyPage = { data: [], page: { nextCursor: null, hasMore: false } };
const sitePage = { data: [siteFixture], page: { nextCursor: null, hasMore: false } };
const pointPage = {
  data: [monitoringPointFixture],
  page: { nextCursor: null, hasMore: false },
};
const devicePage = {
  data: [deviceFixture],
  page: { nextCursor: null, hasMore: false },
};

describe('DevicesManager', () => {
  it('shows loading and then the initial empty state', async () => {
    let finish: ((value: unknown) => void) | undefined;
    const client = createClient((path) => {
      if (path.startsWith('/sites')) return Promise.resolve(sitePage);
      if (path.startsWith('/monitoring-points')) return Promise.resolve(pointPage);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    renderManager(client);
    expect(screen.getByText('Memuat perangkat…')).toBeInTheDocument();

    finish?.(emptyPage);
    expect(await screen.findByText('Belum ada perangkat')).toBeInTheDocument();
  });

  it('shows request ID and retries list errors', async () => {
    let calls = 0;
    const client = createClient(async (path) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path.startsWith('/monitoring-points')) return pointPage;
      calls += 1;
      if (calls === 1) {
        throw new ApiClientError('Unavailable.', 'api', 503, 'UNAVAILABLE', 'req-device-list');
      }
      return devicePage;
    });
    renderManager(client);
    expect(await screen.findByText('Request ID: req-device-list')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByText(deviceFixture.displayName)).toBeInTheDocument();
  });

  it('renders nullable values without deriving connectivity or exposing secrets', async () => {
    const client = standardClient({
      ...deviceFixture,
      credentialHash: 'HASH_MUST_NOT_RENDER',
      rawSecret: 'SECRET_MUST_NOT_RENDER',
    } as Device);
    renderManager(client);

    expect(await screen.findByText(deviceFixture.displayName)).toBeInTheDocument();
    expect(screen.getAllByText(siteFixture.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(monitoringPointFixture.name).length).toBeGreaterThan(0);
    expect(screen.getByText('Firmware belum tersedia')).toBeInTheDocument();
    expect(screen.getByText('Jaringan belum tersedia')).toBeInTheDocument();
    expect(screen.getAllByText(/Belum tersedia/).length).toBeGreaterThan(0);
    expect(screen.queryByText('ONLINE')).not.toBeInTheDocument();
    expect(screen.queryByText('OFFLINE')).not.toBeInTheDocument();
    expect(screen.queryByText('HASH_MUST_NOT_RENDER')).not.toBeInTheDocument();
    expect(screen.queryByText('SECRET_MUST_NOT_RENDER')).not.toBeInTheDocument();
  });

  it('sends search, filters, sort, and organization context through the adapter', async () => {
    const handler = vi.fn(async (path: string) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path.startsWith('/monitoring-points')) return pointPage;
      return emptyPage;
    });
    renderManager(createClient(handler));
    await screen.findByText('Belum ada perangkat');

    await userEvent.type(screen.getByLabelText('Cari'), 'sensor utara');
    await userEvent.selectOptions(screen.getByLabelText('Site'), siteFixture.id);
    await userEvent.selectOptions(
      screen.getByLabelText('Titik monitoring'),
      monitoringPointFixture.id,
    );
    await userEvent.selectOptions(screen.getByLabelText('Lifecycle'), 'DISABLED');
    await userEvent.selectOptions(screen.getByLabelText('Urutkan'), 'displayName:asc');
    await userEvent.click(screen.getByRole('button', { name: 'Terapkan' }));

    await screen.findByText('Tidak ada perangkat yang sesuai');
    const requestPath = handler.mock.calls
      .map(([path]) => path)
      .find((path) => String(path).includes('search=sensor+utara'));
    expect(requestPath).toContain(`siteId=${siteFixture.id}`);
    expect(requestPath).toContain(`monitoringPointId=${monitoringPointFixture.id}`);
    expect(requestPath).toContain('lifecycleStatus=DISABLED');
    expect(requestPath).toContain('sort=displayName%3Aasc');
  });

  it('merges cursor pages without duplicates', async () => {
    const second: Device = { ...deviceFixture, id: 'device-second', displayName: 'Perangkat Dua' };
    const client = createClient(async (path) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path.startsWith('/monitoring-points')) return pointPage;
      if (path.includes('cursor=next-device-page')) {
        return { data: [deviceFixture, second], page: { nextCursor: null, hasMore: false } };
      }
      return {
        data: [deviceFixture],
        page: { nextCursor: 'next-device-page', hasMore: true },
      };
    });
    renderManager(client);
    await screen.findByText(deviceFixture.displayName);
    await userEvent.click(screen.getByRole('button', { name: 'Muat lebih banyak' }));

    expect(await screen.findByText(second.displayName)).toBeInTheDocument();
    expect(screen.getAllByText(deviceFixture.displayName)).toHaveLength(1);
  });

  it('drops the previous organization data immediately', async () => {
    let finishSecond: ((value: unknown) => void) | undefined;
    const client = createClient((path, requestedOrganizationId) => {
      if (path.startsWith('/sites')) return Promise.resolve(sitePage);
      if (path.startsWith('/monitoring-points')) return Promise.resolve(pointPage);
      if (requestedOrganizationId === 'org-second') {
        return new Promise((resolve) => {
          finishSecond = resolve;
        });
      }
      return Promise.resolve(devicePage);
    });
    const view = renderManager(client);
    await screen.findByText(deviceFixture.displayName);
    view.rerender(
      <DevicesManager client={client} organizationId="org-second" role="PROJECT_OWNER" />,
    );

    expect(screen.queryByText(deviceFixture.displayName)).not.toBeInTheDocument();
    expect(screen.getByText('Memuat perangkat…')).toBeInTheDocument();
    finishSecond?.({
      data: [{ ...deviceFixture, id: 'new-org-device', displayName: 'Perangkat Organisasi Baru' }],
      page: { nextCursor: null, hasMore: false },
    });
    expect(await screen.findByText('Perangkat Organisasi Baru')).toBeInTheDocument();
  });

  it.each([
    ['PROJECT_OWNER' as const, true],
    ['SCHOOL_ADMIN' as const, false],
  ])('applies mutation controls for %s', async (role, canMutate) => {
    renderManager(standardClient(), role);
    await screen.findByText(deviceFixture.displayName);
    expect(screen.queryByRole('button', { name: 'Daftarkan perangkat' }) !== null).toBe(canMutate);
    await openDetail();
    expect(screen.queryByRole('button', { name: 'Edit' }) !== null).toBe(canMutate);
    expect(screen.queryByRole('button', { name: 'Rotasi credential' }) !== null).toBe(canMutate);
    expect(screen.queryByRole('button', { name: 'Nonaktifkan' }) !== null).toBe(canMutate);
  });

  it('validates register and loads Site and MonitoringPoint from APIs', async () => {
    const handler = vi.fn(async (path: string, _organization: string, init?: RequestInit) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path.startsWith('/monitoring-points')) return pointPage;
      if (path === '/devices' && init?.method === 'POST') return deviceRegisterFixture;
      return emptyPage;
    });
    renderManager(createClient(handler));
    await screen.findByText('Belum ada perangkat');
    await userEvent.click(screen.getByRole('button', { name: 'Daftarkan perangkat' }));
    const dialog = screen.getByRole('dialog', { name: 'Daftarkan perangkat' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Daftarkan perangkat' }));

    expect(screen.getByText(/Hardware ID harus 3–64/)).toBeInTheDocument();
    expect(screen.getByText('Nama perangkat wajib diisi.')).toBeInTheDocument();
    expect(screen.getByText('Site wajib dipilih.')).toBeInTheDocument();
    expect(screen.getByText('Titik monitoring wajib dipilih.')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Hardware ID'), 'DEVICE-TEST-001');
    await userEvent.type(within(dialog).getByLabelText('Nama perangkat'), 'Perangkat Test');
    await userEvent.selectOptions(
      await within(dialog).findByLabelText('Pilih Site'),
      siteFixture.id,
    );
    await userEvent.selectOptions(
      await within(dialog).findByLabelText('Pilih titik monitoring'),
      monitoringPointFixture.id,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Daftarkan perangkat' }));

    expect(await screen.findByRole('dialog', { name: /Simpan credential/ })).toBeInTheDocument();
    const registerCall = handler.mock.calls.find(([, , init]) => init?.method === 'POST');
    expect(JSON.parse(String(registerCall?.[2]?.body))).toEqual({
      hardwareId: 'DEVICE-TEST-001',
      displayName: 'Perangkat Test',
      monitoringPointId: monitoringPointFixture.id,
    });
    expect(registerCall?.[2]?.body).not.toContain(siteFixture.id);
  });

  it('keeps one-time credentials temporary, supports clipboard, and clears the DOM', async () => {
    const user = userEvent.setup();
    const secret = deviceRegisterFixture.data.credential.secret;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const close = vi.fn();
    const view = render(
      <OneTimeCredentialDialog
        credential={deviceRegisterFixture.data.credential}
        onClose={close}
      />,
    );

    expect(screen.getByLabelText('Secret perangkat')).toHaveValue(secret);
    expect(screen.getByRole('button', { name: 'Tutup dan hapus dari layar' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Salin' }));
    expect(writeText).toHaveBeenCalledWith(secret);
    expect(await screen.findByText('Secret berhasil disalin.')).toBeInTheDocument();
    expect(storageSpy).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain(secret);

    await user.click(
      screen.getByLabelText('Saya telah menyimpan secret melalui mekanisme yang aman.'),
    );
    await user.click(screen.getByRole('button', { name: 'Tutup dan hapus dari layar' }));
    expect(close).toHaveBeenCalledOnce();
    view.unmount();
    expect(screen.queryByDisplayValue(secret)).not.toBeInTheDocument();
  });

  it('shows safe clipboard failure feedback', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(
      <OneTimeCredentialDialog
        credential={deviceRegisterFixture.data.credential}
        onClose={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salin' }));
    expect(
      await screen.findByText('Secret tidak dapat disalin. Pilih dan salin secara manual.'),
    ).toBeInTheDocument();
  });

  it('edits mutable fields but never exposes credential data in detail', async () => {
    const handler = vi.fn(async (path: string, _organization: string, init?: RequestInit) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path.startsWith('/monitoring-points')) return pointPage;
      if (path === `/devices/${deviceFixture.id}` && init?.method === 'PATCH') {
        return { data: { ...deviceFixture, displayName: 'Perangkat Baru' } };
      }
      if (path === `/devices/${deviceFixture.id}`) {
        return {
          data: {
            ...deviceFixture,
            credentialHash: 'HASH_DETAIL_MUST_NOT_RENDER',
            secret: 'SECRET_DETAIL_MUST_NOT_RENDER',
          },
        };
      }
      return devicePage;
    });
    renderManager(createClient(handler));
    await openDetail();
    expect(screen.queryByText('HASH_DETAIL_MUST_NOT_RENDER')).not.toBeInTheDocument();
    expect(screen.queryByText('SECRET_DETAIL_MUST_NOT_RENDER')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const name = screen.getByLabelText('Nama perangkat');
    await userEvent.clear(name);
    await userEvent.type(name, 'Perangkat Baru');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }));

    expect(await screen.findByText('Data perangkat tersimpan.')).toBeInTheDocument();
    const updateCall = handler.mock.calls.find(([, , init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(updateCall?.[2]?.body))).toEqual({
      displayName: 'Perangkat Baru',
      monitoringPointId: monitoringPointFixture.id,
    });
  });

  it('confirms credential rotation and opens a fresh one-time dialog', async () => {
    const client = createClient(async (path, _organization, init) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path.startsWith('/monitoring-points')) return pointPage;
      if (path.endsWith('/rotate-credential') && init?.method === 'POST') {
        return rotateCredentialFixture;
      }
      if (path === `/devices/${deviceFixture.id}`) return { data: deviceFixture };
      return devicePage;
    });
    renderManager(client);
    await openDetail();
    await userEvent.click(screen.getByRole('button', { name: 'Rotasi credential' }));
    expect(
      screen.getByRole('alertdialog', { name: 'Rotasi credential perangkat?' }),
    ).toHaveTextContent('Secret lama segera tidak berlaku');
    await userEvent.click(screen.getByRole('button', { name: 'Ya, rotasi credential' }));
    expect(
      await screen.findByDisplayValue(rotateCredentialFixture.data.credential.secret),
    ).toBeInTheDocument();
  });

  it('hides rotate and disable for disabled devices', async () => {
    const disabled: Device = {
      ...deviceFixture,
      lifecycleStatus: 'DISABLED',
      disabledAt: '2026-07-31T01:00:00.000Z',
    };
    renderManager(standardClient(disabled));
    await openDetail(disabled.displayName);
    expect(screen.getAllByText('Dinonaktifkan').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Rotasi credential' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nonaktifkan' })).not.toBeInTheDocument();
  });

  it('confirms disable and handles backend conflict safely', async () => {
    let disableShouldFail = true;
    const client = createClient(async (path, _organization, init) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path.startsWith('/monitoring-points')) return pointPage;
      if (path.endsWith('/disable') && init?.method === 'POST') {
        if (disableShouldFail) {
          disableShouldFail = false;
          throw new ApiClientError('Internal conflict.', 'api', 409, 'DEVICE_CONFLICT', 'req-409');
        }
        return { data: { ...deviceFixture, lifecycleStatus: 'DISABLED' } };
      }
      if (path === `/devices/${deviceFixture.id}`) return { data: deviceFixture };
      return devicePage;
    });
    renderManager(client);
    await openDetail();
    await userEvent.click(screen.getByRole('button', { name: 'Nonaktifkan' }));
    expect(screen.getByRole('alertdialog', { name: 'Nonaktifkan perangkat?' })).toHaveTextContent(
      'histori telemetry tetap tersedia',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ya, nonaktifkan' }));
    expect(
      await screen.findByText(/Tindakan bertentangan dengan status.*Request ID: req-409/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Nonaktifkan' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ya, nonaktifkan' }));
    expect(await screen.findByText(/berada dalam status dinonaktifkan/)).toBeInTheDocument();
  });

  it.each([
    [403, 'Anda tidak memiliki izin'],
    [404, 'Perangkat atau assignment tidak ditemukan'],
    [409, 'Tindakan bertentangan dengan status atau assignment'],
  ])('maps backend status %s to a safe mutation message', (status, expected) => {
    const error = new ApiClientError(
      'Detail internal tidak digunakan.',
      'api',
      status,
      'SAFE_TEST_CODE',
      `req-${status}`,
    );
    const message = safeMutationError(error, 'Fallback');
    expect(message).toContain(expected);
    expect(message).toContain(`Request ID: req-${status}`);
    expect(message).not.toContain('Detail internal');
  });
});

function renderManager(client: OrganizationApiClient, role: Role = 'PROJECT_OWNER') {
  return render(<DevicesManager client={client} organizationId={organizationId} role={role} />);
}

async function openDetail(displayName = deviceFixture.displayName): Promise<void> {
  await screen.findByText(displayName);
  await userEvent.click(screen.getByRole('button', { name: `Lihat detail ${displayName}` }));
  await screen.findByText('Detail perangkat');
}

function standardClient(device: Device = deviceFixture): OrganizationApiClient {
  return createClient(async (path) => {
    if (path.startsWith('/sites')) return sitePage;
    if (path.startsWith('/monitoring-points')) return pointPage;
    if (path === `/devices/${device.id}`) return { data: device };
    return { data: [device], page: { nextCursor: null, hasMore: false } };
  });
}

type Handler = (path: string, organizationId: string, init?: RequestInit) => Promise<unknown>;

function createClient(handler: Handler): OrganizationApiClient {
  return {
    async organizationRequest<T>(
      path: string,
      requestedOrganizationId: string,
      init?: RequestInit,
    ): Promise<T> {
      expect(requestedOrganizationId).not.toBe('');
      return (await handler(path, requestedOrganizationId, init)) as T;
    },
  };
}
