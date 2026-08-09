import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { primaryNavigation } from '../components/application-shell';
import {
  getSingleDeviceDiagnostics,
  getSingleDeviceOverview,
  getSingleDeviceRiskProfile,
  listSingleDeviceAuditLog,
  updateSingleDeviceRiskProfile,
} from './single-device-api';
import {
  chartSegments,
  riskLabel,
  riskReasonLabel,
  type SeriesPoint,
} from './single-device-contracts';
import { AuditPanel, OverviewPanel, ProfilePanel } from './panels';

interface RequestClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

function requestClient(): {
  readonly client: RequestClient;
  readonly request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn().mockResolvedValue({});
  return { client: { request }, request };
}

describe('single-device frontend contract', () => {
  it('uses the replacement endpoints without organization context', async () => {
    const { client, request } = requestClient();
    await getSingleDeviceOverview(client, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
    await getSingleDeviceDiagnostics(client);
    await getSingleDeviceRiskProfile(client);
    await updateSingleDeviceRiskProfile(client, {});
    await listSingleDeviceAuditLog(client, 'signed-cursor');

    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/overview?from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z',
      '/device',
      '/risk-profile',
      '/risk-profile',
      '/audit-log?limit=25&cursor=signed-cursor',
    ]);
    expect(
      request.mock.calls.some(([, init]) => new Headers(init?.headers).has('x-organization-id')),
    ).toBe(false);
  });

  it('maps every authoritative risk status for the Indonesian UI', () => {
    expect(riskLabel).toEqual({
      SAFE: 'AMAN',
      WATCH: 'WASPADA',
      DANGER: 'BAHAYA',
      UNKNOWN: 'TIDAK DIKETAHUI',
    });
    expect(riskReasonLabel('DANGER_RAINFALL')).toBe('Curah hujan mencapai ambang bahaya');
  });

  it('breaks native chart segments at unavailable readings', () => {
    const points: readonly SeriesPoint[] = [
      { timestamp: '2026-01-01T00:00:00.000Z', value: 10 },
      { timestamp: '2026-01-01T01:00:00.000Z', value: 12 },
      { timestamp: '2026-01-01T02:00:00.000Z', value: null },
      { timestamp: '2026-01-01T03:00:00.000Z', value: 14 },
      { timestamp: '2026-01-01T04:00:00.000Z', value: 15 },
    ];
    expect(chartSegments(points)).toEqual([
      [10, 12],
      [14, 15],
    ]);
  });

  it('uses selected overview ranges and keeps UNKNOWN visibly distinct from SAFE', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_PRESENTATION_MODE = 'false';
    const user = userEvent.setup();
    const { client, request } = requestClient();
    request.mockResolvedValue(overview('UNKNOWN'));
    render(createElement(OverviewPanel, { client }));
    expect(await screen.findByText('TIDAK DIKETAHUI')).toBeInTheDocument();
    expect(screen.getByText('UNKNOWN', { exact: true })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Rentang histori'), '5');
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    const path = request.mock.calls[1]?.[0] as string;
    expect(path).toMatch(/^\/overview\?from=/);
    expect(
      request.mock.calls.every(([requestedPath]) => String(requestedPath).startsWith('/overview?')),
    ).toBe(true);
  });

  it('shows the synthetic-data banner only in explicit presentation mode', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_PRESENTATION_MODE = 'true';
    const { client, request } = requestClient();
    request.mockResolvedValue(overview('SAFE'));
    render(createElement(OverviewPanel, { client }));
    expect(screen.getByText(/Mode Demonstrasi/)).toBeInTheDocument();
    await screen.findByText('AMAN');
  });

  it('exposes only the four R3 primary navigation destinations', () => {
    expect(primaryNavigation).toEqual([
      { label: 'Overview', href: '/overview' },
      { label: 'Perangkat', href: '/devices' },
      { label: 'Profil Risiko', href: '/settings/risk-profile' },
      { label: 'Audit Log', href: '/settings/audit-log' },
    ]);
  });

  it('initializes risk-profile fields and rejects WATCH equal to DANGER before updating', async () => {
    const user = userEvent.setup();
    const { client, request } = requestClient();
    request.mockResolvedValueOnce({ data: profile(3, 'catatan awal') });
    render(createElement(ProfilePanel, { client }));

    expect(await screen.findByDisplayValue('10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('catatan awal')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Kemiringan DANGER'));
    await user.type(screen.getByLabelText('Kemiringan DANGER'), '10');
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByText(/WATCH harus lebih rendah/)).toBeInTheDocument();
    expect(request).toHaveBeenCalledOnce();
  });

  it('reports a no-op profile update and appends audit pages without duplicate IDs', async () => {
    const user = userEvent.setup();
    const { client, request } = requestClient();
    request
      .mockResolvedValueOnce({ data: profile(3, null) })
      .mockResolvedValueOnce({ data: { changed: false, profile: profile(3, null) } })
      .mockResolvedValueOnce({ data: profile(3, null) });
    const { unmount } = render(createElement(ProfilePanel, { client }));
    expect(await screen.findByText(/Versi 3/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Tidak ada perubahan pada profil aktif.')).toBeInTheDocument();
    unmount();

    request.mockReset();
    request
      .mockResolvedValueOnce({
        data: [audit('a'), audit('b')],
        page: { hasMore: true, nextCursor: 'next' },
      })
      .mockResolvedValueOnce({
        data: [audit('b'), audit('c')],
        page: { hasMore: false, nextCursor: null },
      });
    render(createElement(AuditPanel, { client }));
    expect((await screen.findAllByText(/Profil risiko v3/)).length).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Muat berikutnya' }));
    await waitFor(() => expect(screen.getAllByText(/AMAN → WASPADA/)).toHaveLength(3));
    expect(request).toHaveBeenNthCalledWith(2, '/audit-log?limit=25&cursor=next');
  });
});

function profile(version: number, notes: string | null) {
  return {
    version,
    calibrationStatus: 'PROVISIONAL',
    activatedAt: '2026-01-01T00:00:00.000Z',
    notes,
    tiltMagnitudeDeg: { watch: 10, danger: 20 },
    soilMoisturePct: { watch: 30, danger: 40 },
    rainfallMmHour: { watch: 50, danger: 60 },
    rainfallDuration: {
      moderateDailyMinMm: 30,
      moderateDailyMaxMm: 50,
      consecutiveDays: 3,
      continuationRainfallMmHourGt: 0,
    },
  };
}

function audit(id: string) {
  return {
    id,
    previousStatus: 'SAFE' as const,
    currentStatus: 'WATCH' as const,
    reasons: ['WATCH_TILT'],
    sensorSnapshot: { tiltMagnitudeDeg: 10, soilMoisturePct: 20, rainfallMmHour: 30 },
    riskProfile: { id: 'profile-3', version: 3 },
    telemetryId: 'telemetry-1',
    occurredAt: '2026-01-01T00:00:00.000Z',
  };
}

function overview(status: 'SAFE' | 'UNKNOWN') {
  return {
    data: {
      generatedAt: '2026-01-01T00:00:00.000Z',
      configured: true,
      risk: { status, reasons: [], observedAt: null, freshness: 'ONLINE' },
      readings: { tiltMagnitudeDeg: 1, soilMoisturePct: 2, rainfallMmHour: 3 },
      series: { tiltMagnitudeDeg: [], soilMoisturePct: [], rainfallMmHour: [] },
      thresholds: {
        tiltMagnitudeDeg: { watch: 3, danger: 8 },
        soilMoisturePct: { watch: 50, danger: 80 },
        rainfallMmHour: { watch: 10, danger: 30 },
      },
      range: { from: '2026-01-01T00:00:00.000Z', to: '2026-01-01T01:00:00.000Z' },
    },
  };
}
