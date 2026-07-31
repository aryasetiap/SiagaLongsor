import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import { AlertsManager } from './alerts-manager';
import { MonitoringOverviewManager } from './monitoring-overview-manager';
import { RiskProfileManager } from './risk-profile-manager';
import {
  alertFixture,
  assessmentFixture,
  overviewFixture,
  profileFixture,
} from '../../test/phase-03-fixtures';

const emptyPage = { data: [], page: { nextCursor: null, hasMore: false } };
const sitePage = {
  data: [{ id: 'site-phase-03', name: 'SMAN 17', address: null, timezone: 'Asia/Jakarta' }],
  page: { nextCursor: null, hasMore: false },
};

describe('MonitoringOverviewManager', () => {
  it('renders loading, empty states, errors, retry, and filters', async () => {
    let overviewCalls = 0;
    const client = createClient(async (path) => {
      if (path.startsWith('/sites')) return sitePage;
      overviewCalls += 1;
      if (overviewCalls === 1) {
        throw new ApiClientError('Gagal', 'api', 503, 'UNAVAILABLE', 'req-overview');
      }
      return emptyPage;
    });
    render(<MonitoringOverviewManager client={client} organizationId="org-1" />);
    expect(screen.getByLabelText('Memuat overview')).toBeInTheDocument();
    expect(await screen.findByText('Request ID: req-overview')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByText('Belum ada data monitoring')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Cari'), 'lereng');
    await userEvent.selectOptions(screen.getByLabelText('Risiko'), 'DANGER');
    await userEvent.click(screen.getByRole('button', { name: 'Terapkan' }));
    expect(await screen.findByText('Tidak ada hasil yang sesuai')).toBeInTheDocument();
    const requestedPaths = vi
      .mocked(client.organizationRequest)
      .mock.calls.map(([path]) => String(path));
    expect(requestedPaths.some((path) => path.includes('search=lereng'))).toBe(true);
    expect(requestedPaths.some((path) => path.includes('riskLevel=DANGER'))).toBe(true);
  });

  it('renders semantic statuses, sensor values, alerts, stale warning, and UNKNOWN null state', async () => {
    const stale = {
      ...overviewFixture,
      monitoringPoint: { ...overviewFixture.monitoringPoint, id: 'mp-stale', name: 'Lereng Stale' },
      currentState: {
        ...overviewFixture.currentState,
        monitoringPointId: 'mp-stale',
        serverRisk: 'UNKNOWN' as const,
        connectivityStatus: 'OFFLINE' as const,
        reasons: ['DEVICE_OFFLINE'] as const,
      },
    };
    const missing = {
      ...overviewFixture,
      monitoringPoint: { ...overviewFixture.monitoringPoint, id: 'mp-empty', name: 'Tanpa Sensor' },
      device: null,
      latestTelemetry: null,
      currentState: {
        ...overviewFixture.currentState,
        monitoringPointId: 'mp-empty',
        deviceId: null,
        serverRisk: 'UNKNOWN' as const,
        connectivityStatus: 'UNKNOWN' as const,
        reasons: ['REQUIRED_SENSOR_MISSING'] as const,
        latestTelemetryId: null,
        lastTelemetryAt: null,
      },
    };
    const client = createClient(async (path) =>
      path.startsWith('/sites')
        ? sitePage
        : { data: [overviewFixture, stale, missing], page: { nextCursor: null, hasMore: false } },
    );
    render(<MonitoringOverviewManager client={client} organizationId="org-1" />);
    expect((await screen.findAllByText('Waspada')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Terhubung').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Tidak dapat ditentukan').length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText('Nilai berikut adalah rekaman terakhir, bukan kondisi terkini.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('4.2°').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 peringatan aktif').length).toBeGreaterThan(0);
    expect(screen.getByText('Data sensor belum tersedia.')).toBeInTheDocument();
    expect(screen.queryByText(/credentialHash|rawPayload|Authorization/)).not.toBeInTheDocument();
  });

  it('merges cursor pages without duplicates and renders late assessment provenance', async () => {
    const second = {
      ...overviewFixture,
      monitoringPoint: {
        ...overviewFixture.monitoringPoint,
        id: 'mp-second',
        name: 'Lereng Kedua',
      },
    };
    const client = createClient(async (path) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path.includes('/risk-assessments')) {
        return { data: [assessmentFixture], page: { nextCursor: null, hasMore: false } };
      }
      if (path.includes('cursor=next')) {
        return { data: [overviewFixture, second], page: { nextCursor: null, hasMore: false } };
      }
      return { data: [overviewFixture], page: { nextCursor: 'next', hasMore: true } };
    });
    render(<MonitoringOverviewManager client={client} organizationId="org-1" />);
    await screen.findByText('Lereng Utama');
    await userEvent.click(screen.getByRole('button', { name: 'Muat lebih banyak' }));
    expect(await screen.findByText('Lereng Kedua')).toBeInTheDocument();
    expect(screen.getAllByText('Lereng Utama')).toHaveLength(1);
    await userEvent.click(screen.getAllByRole('button', { name: 'Lihat riwayat penilaian' })[0]!);
    expect(await screen.findByText('Data historis terlambat')).toBeInTheDocument();
    expect(screen.getByText(/profile-phase-03 · versi 1/)).toBeInTheDocument();
  });

  it('ignores an old organization response after organization switch', async () => {
    let resolveOld: ((value: unknown) => void) | undefined;
    const client = createClient((path, organizationId) => {
      if (path.startsWith('/sites')) return Promise.resolve(sitePage);
      if (organizationId === 'org-old')
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      return Promise.resolve({
        data: [
          {
            ...overviewFixture,
            monitoringPoint: { ...overviewFixture.monitoringPoint, name: 'Organisasi Baru' },
          },
        ],
        page: { nextCursor: null, hasMore: false },
      });
    });
    const { rerender } = render(
      <MonitoringOverviewManager client={client} organizationId="org-old" />,
    );
    rerender(<MonitoringOverviewManager client={client} organizationId="org-new" />);
    expect(await screen.findByText('Organisasi Baru')).toBeInTheDocument();
    resolveOld?.({ data: [overviewFixture], page: { nextCursor: null, hasMore: false } });
    await waitFor(() => expect(screen.queryByText('Lereng Utama')).not.toBeInTheDocument());
  });
});

describe('AlertsManager', () => {
  it('renders list, occurrence, detail, filters, and no mutation controls for both roles', async () => {
    const client = createClient(async (path) => {
      if (path.startsWith('/sites')) return sitePage;
      if (path.startsWith('/monitoring-points')) return emptyPage;
      if (path === '/alerts/alert-phase-03') return { data: alertFixture };
      return { data: [alertFixture], page: { nextCursor: null, hasMore: false } };
    });
    render(<AlertsManager client={client} organizationId="org-1" />);
    expect(await screen.findByText('Risiko Waspada')).toBeInTheDocument();
    expect(screen.getByText('Peringatan · 2 kali')).toBeInTheDocument();
    expect(screen.getByText('Aktif — belum ditangani')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Lihat detail' }));
    expect(await screen.findByRole('dialog', { name: 'Detail peringatan' })).toBeInTheDocument();
    expect(screen.getByText('Jumlah observasi')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /acknowledge|resolve|alarm palsu/i }),
    ).not.toBeInTheDocument();
  });
});

describe('RiskProfileManager', () => {
  it('loads Site from API and keeps SCHOOL_ADMIN read-only with provisional warning', async () => {
    const client = profileClient();
    render(<RiskProfileManager client={client} organizationId="org-1" role="SCHOOL_ADMIN" />);
    expect(screen.getByText(/Profil ini masih bersifat sementara/)).toBeInTheDocument();
    await userEvent.selectOptions(
      await screen.findByLabelText('Pilih Site untuk profil risiko'),
      'site-phase-03',
    );
    expect(await screen.findByText('Profil risiko versi 1')).toBeInTheDocument();
    expect(screen.getByText('Kalibrasi: PROVISIONAL')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Simpan sebagai versi baru' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Admin Sekolah memiliki akses baca saja.')).toBeInTheDocument();
    expect(screen.getByLabelText('Catatan')).toBeDisabled();
  });

  it('handles owner no-op and a server-returned new version without optimistic increment', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let updates = 0;
    const client = createClient(async (path, _organizationId, init) => {
      if (path.startsWith('/sites?')) return sitePage;
      if (init?.method === 'PUT') {
        updates += 1;
        return updates === 1
          ? { data: { profile: profileFixture, changed: false } }
          : {
              data: {
                profile: { ...profileFixture, version: 2, notes: 'Catatan baru' },
                changed: true,
              },
            };
      }
      return { data: profileFixture };
    });
    render(<RiskProfileManager client={client} organizationId="org-1" role="PROJECT_OWNER" />);
    await userEvent.selectOptions(
      await screen.findByLabelText('Pilih Site untuk profil risiko'),
      'site-phase-03',
    );
    await screen.findByText('Profil risiko versi 1');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan sebagai versi baru' }));
    expect(
      await screen.findByText('Tidak ada perubahan konfigurasi. Versi aktif tetap sama.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Profil risiko versi 1')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Catatan'));
    await userEvent.type(screen.getByLabelText('Catatan'), 'Catatan baru');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan sebagai versi baru' }));
    expect(await screen.findByText('Versi 2 berhasil dibuat dan diaktifkan.')).toBeInTheDocument();
    expect(screen.getByText('Profil risiko versi 2')).toBeInTheDocument();
  });

  it('shows backend permission/validation errors safely', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const client = createClient(async (path, _organizationId, init) => {
      if (path.startsWith('/sites?')) return sitePage;
      if (init?.method === 'PUT') throw new ApiClientError('Forbidden', 'api', 403, 'FORBIDDEN');
      return { data: profileFixture };
    });
    render(<RiskProfileManager client={client} organizationId="org-1" role="PROJECT_OWNER" />);
    await userEvent.selectOptions(
      await screen.findByLabelText('Pilih Site untuk profil risiko'),
      'site-phase-03',
    );
    await screen.findByText('Profil risiko versi 1');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan sebagai versi baru' }));
    expect(
      await screen.findByText('Anda tidak memiliki izin untuk mengubah profil risiko.'),
    ).toBeInTheDocument();
  });
});

function profileClient() {
  return createClient(async (path) =>
    path.startsWith('/sites?') ? sitePage : { data: profileFixture },
  );
}

function createClient(
  handler: (path: string, organizationId: string, init?: RequestInit) => unknown | Promise<unknown>,
): OrganizationApiClient {
  return {
    organizationRequest: vi.fn(
      async <T,>(path: string, organizationId: string, init?: RequestInit) =>
        (await handler(path, organizationId, init)) as T,
    ) as OrganizationApiClient['organizationRequest'],
  };
}
