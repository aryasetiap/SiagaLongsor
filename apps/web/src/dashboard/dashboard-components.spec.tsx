import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import { DashboardManager } from './dashboard-manager';
import type { DashboardSummary } from './dashboard-contracts';
import {
  alertFixture,
  dashboardSummaryFixture,
  overviewFixture,
  sensorSeriesFixture,
} from '../../test/phase-04-fixtures';

describe('Phase 04 Dashboard', () => {
  it('renders authoritative KPI, risk/connectivity text, monitoring, and recent alerts accessibly', async () => {
    const client = dashboardClient();
    render(<DashboardManager client={client} organizationId="org-1" />);

    expect(await screen.findByLabelText('Titik Monitoring Aktif: 5')).toBeInTheDocument();
    expect(screen.getByLabelText('Peringatan Kritis Aktif: 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Perangkat Tidak Terhubung: 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Peringatan Baru: 2')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Distribusi risiko dari 5 titik aktif/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Tidak dapat ditentukan')).not.toHaveLength(0);
    expect(screen.getAllByText('Tidak terhubung')).not.toHaveLength(0);
    expect(await screen.findByText('Lereng Utama')).toBeInTheDocument();
    expect(screen.getByTestId('monitoring-responsive-table')).toHaveClass('overflow-x-auto');
    expect(screen.getByRole('columnheader', { name: 'Titik / Site' })).toBeInTheDocument();
    expect(screen.getByText('Risiko Waspada')).toBeInTheDocument();
    expect(screen.getByText('2×')).toBeInTheDocument();
    expect(screen.queryByText(/delta|naik|turun/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /acknowledge|resolve|alarm palsu/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps successful panels visible when summary fails and never converts the error to zero', async () => {
    const client = dashboardClient((path) => {
      if (path.startsWith('/dashboard/summary')) {
        throw new ApiClientError('Summary failed', 'api', 500, 'INTERNAL_ERROR', 'request-summary');
      }
      return undefined;
    });
    render(<DashboardManager client={client} organizationId="org-1" />);

    expect(await screen.findByText('Lereng Utama')).toBeInTheDocument();
    expect(screen.getByText('Ringkasan dashboard tidak dapat dimuat.')).toBeInTheDocument();
    expect(screen.getByText('Request ID: request-summary')).toBeInTheDocument();
    expect(screen.queryByLabelText('Titik Monitoring Aktif: 0')).not.toBeInTheDocument();
    expect(screen.getByText('Risiko Waspada')).toBeInTheDocument();
  });

  it('reloads relevant panels for Site, window, and manual refresh without undefined query values', async () => {
    const client = dashboardClient();
    render(<DashboardManager client={client} organizationId="org-1" />);
    await screen.findByLabelText('Titik Monitoring Aktif: 5');

    await userEvent.selectOptions(screen.getByLabelText('Filter Site dashboard'), 'site-phase-03');
    await waitFor(() => {
      const paths = calls(client);
      expect(
        paths.some((path) =>
          path.includes('/dashboard/summary?siteId=site-phase-03&windowHours=24'),
        ),
      ).toBe(true);
      expect(paths.some((path) => path.includes('/monitoring-overview?siteId=site-phase-03'))).toBe(
        true,
      );
      expect(paths.some((path) => path.includes('/alerts?siteId=site-phase-03'))).toBe(true);
    });
    await userEvent.selectOptions(screen.getByLabelText('Rentang dashboard'), '72');
    await waitFor(() =>
      expect(calls(client).some((path) => path.includes('windowHours=72'))).toBe(true),
    );
    const countBefore = vi.mocked(client.organizationRequest).mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Segarkan seluruh dashboard' }));
    await waitFor(() =>
      expect(vi.mocked(client.organizationRequest).mock.calls.length).toBeGreaterThan(countBefore),
    );
    expect(calls(client).join('')).not.toContain('undefined');
  });

  it('selects a point, renders oldest-first sensor summary, units, gaps, and late marker', async () => {
    const client = dashboardClient();
    render(<DashboardManager client={client} organizationId="org-1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pilih untuk grafik' }));

    expect(await screen.findByRole('img', { name: /Grafik Kemiringan/ })).toBeInTheDocument();
    expect(screen.getByText(/Kemiringan: 2 titik/)).toHaveTextContent('°');
    expect(screen.getByText(/gap terlihat/)).toBeInTheDocument();
    expect(screen.queryByText(/data terlambat, 1/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Sertakan data terlambat'));
    expect(await screen.findByText(/Kemiringan: 3 titik/)).toHaveTextContent('1 data terlambat');
    expect(screen.getByText(/bentuk wajik/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Sensor'), 'battery');
    expect(screen.getByText(/Tegangan baterai: 2 titik/)).toHaveTextContent('V');
    expect(screen.getByText(/Tegangan baterai: 2 titik/)).not.toHaveTextContent('minimum 0 V');
  });

  it('resets selected point when monitoring filters change and does not write browser storage', async () => {
    localStorage.clear();
    sessionStorage.clear();
    const client = dashboardClient();
    render(<DashboardManager client={client} organizationId="org-1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pilih untuk grafik' }));
    expect(await screen.findByRole('img', { name: /Grafik Kemiringan/ })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Cari titik monitoring'), 'lereng');
    await userEvent.click(screen.getByRole('button', { name: 'Terapkan filter' }));
    expect(await screen.findByText('Belum ada titik monitoring yang dipilih.')).toBeInTheDocument();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it('appends sensor cursor pages oldest-first without duplicate telemetry', async () => {
    const firstPage = {
      data: {
        items: sensorSeriesFixture.data.items.slice(0, 2),
        nextCursor: 'next',
        hasMore: true,
      },
    };
    const client = dashboardClient((path) => {
      if (path.includes('/sensor-series') && path.includes('cursor=next')) {
        return {
          data: {
            items: [sensorSeriesFixture.data.items[1], sensorSeriesFixture.data.items[2]],
            nextCursor: null,
            hasMore: false,
          },
        };
      }
      if (path.includes('/sensor-series')) return firstPage;
      return undefined;
    });
    render(<DashboardManager client={client} organizationId="org-1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pilih untuk grafik' }));
    await screen.findByRole('img', { name: /Grafik Kemiringan/ });
    await userEvent.click(screen.getByRole('button', { name: 'Muat data berikutnya' }));
    expect(await screen.findByText(/Kemiringan: 3 titik/)).toBeInTheDocument();
  });

  it('handles zero risk total, sensor empty/error, and recent-alert detail without mutation', async () => {
    const zeroSummary: DashboardSummary = {
      ...dashboardSummaryFixture,
      monitoringPoints: { total: 0, active: 0, inactive: 0 },
      riskDistribution: { safe: 0, watch: 0, danger: 0, unknown: 0 },
    };
    const client = dashboardClient((path) => {
      if (path.startsWith('/dashboard/summary')) return { data: zeroSummary };
      if (path.includes('/sensor-series'))
        return { data: { items: [], nextCursor: null, hasMore: false } };
      return undefined;
    });
    render(<DashboardManager client={client} organizationId="org-1" />);
    expect(
      await screen.findByText('Belum ada titik aktif untuk divisualisasikan.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pilih untuk grafik' }));
    expect(await screen.findByText('Tidak ada data sensor pada rentang ini.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Lihat detail' }));
    expect(await screen.findByRole('dialog', { name: 'Detail peringatan' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /acknowledge|resolve|alarm palsu/i }),
    ).not.toBeInTheDocument();
  });

  it('ignores stale responses after an organization-key switch', async () => {
    let resolveOld: ((value: unknown) => void) | undefined;
    const client = dashboardClient((path, organizationId) => {
      if (path.startsWith('/dashboard/summary') && organizationId === 'org-old') {
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      }
      if (path.startsWith('/dashboard/summary')) {
        return {
          data: {
            ...dashboardSummaryFixture,
            monitoringPoints: { total: 9, active: 9, inactive: 0 },
          },
        };
      }
      return undefined;
    });
    const { rerender } = render(
      <DashboardManager key="org-old" client={client} organizationId="org-old" />,
    );
    rerender(<DashboardManager key="org-new" client={client} organizationId="org-new" />);
    expect(await screen.findByLabelText('Titik Monitoring Aktif: 9')).toBeInTheDocument();
    resolveOld?.({ data: dashboardSummaryFixture });
    await waitFor(() =>
      expect(screen.queryByLabelText('Titik Monitoring Aktif: 5')).not.toBeInTheDocument(),
    );
  });
});

function dashboardClient(
  override?: (path: string, organizationId: string) => unknown | Promise<unknown> | undefined,
): OrganizationApiClient {
  return {
    organizationRequest: vi.fn(async <T,>(path: string, organizationId: string) => {
      const overridden = await override?.(path, organizationId);
      if (overridden !== undefined) return overridden as T;
      if (path.startsWith('/sites?')) {
        return { data: [overviewFixture.site], page: { nextCursor: null, hasMore: false } } as T;
      }
      if (path.startsWith('/dashboard/summary')) return { data: dashboardSummaryFixture } as T;
      if (path.startsWith('/monitoring-overview')) {
        return { data: [overviewFixture], page: { nextCursor: null, hasMore: false } } as T;
      }
      if (path.startsWith('/alerts/')) return { data: alertFixture } as T;
      if (path.startsWith('/alerts')) {
        return { data: [alertFixture], page: { nextCursor: null, hasMore: false } } as T;
      }
      if (path.includes('/sensor-series')) {
        const items = path.includes('includeLate=true')
          ? sensorSeriesFixture.data.items
          : sensorSeriesFixture.data.items.filter((point) => !point.isLate);
        return { data: { items, nextCursor: null, hasMore: false } } as T;
      }
      if (path.includes('/risk-assessments')) {
        return { data: [], page: { nextCursor: null, hasMore: false } } as T;
      }
      throw new Error(`Unexpected path: ${path}`);
    }) as OrganizationApiClient['organizationRequest'],
  };
}

function calls(client: OrganizationApiClient): string[] {
  return vi.mocked(client.organizationRequest).mock.calls.map(([path]) => path);
}
