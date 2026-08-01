'use client';

import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';

import type { ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { listMonitoringOverview } from '../risk/risk-api';
import { RiskAssessmentDialog } from '../risk/risk-assessment-dialog';
import type {
  ConnectivityStatus,
  MonitoringOverviewItem,
  MonitoringOverviewQuery,
  MonitoringOverviewSort,
  RiskLevel,
} from '../risk/risk-contracts';
import { connectivityLabel, formatSiteTimestamp, RiskBadge } from '../risk/risk-presentation';
import { DashboardCard, PanelError, PanelSkeleton } from './panel-ui';

interface Props {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly siteId: string;
  readonly refreshGeneration: number;
  readonly selected: MonitoringOverviewItem | null;
  readonly onSelect: (item: MonitoringOverviewItem | null) => void;
}

export function MonitoringPanel(props: Props) {
  const [search, setSearch] = useState('');
  const [risk, setRisk] = useState('');
  const [connectivity, setConnectivity] = useState('');
  const [sort, setSort] = useState<MonitoringOverviewSort>('name:asc');
  const [filters, setFilters] = useState<MonitoringOverviewQuery>({ sort: 'name:asc' });
  const [result, setResult] = useState<ListEnvelope<MonitoringOverviewItem> | null>(null);
  const [failure, setFailure] = useState<{
    readonly key: string;
    readonly error: Error;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [history, setHistory] = useState<MonitoringOverviewItem | null>(null);
  const query = useMemo(
    () => ({
      ...filters,
      ...(props.siteId === '' ? {} : { siteId: props.siteId }),
    }),
    [filters, props.siteId],
  );
  const queryKey = JSON.stringify([props.organizationId, query, props.refreshGeneration, retry]);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const current = resultKey === queryKey ? result : null;
  const error = failure?.key === queryKey ? failure.error : null;

  useEffect(() => {
    let active = true;
    void listMonitoringOverview(props.client, props.organizationId, { ...query, limit: 25 })
      .then((response) => {
        if (!active) return;
        setResult(response);
        setResultKey(queryKey);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setFailure({
          key: queryKey,
          error: reason instanceof Error ? reason : new Error('Monitoring gagal dimuat.'),
        });
        setResultKey(queryKey);
      });
    return () => {
      active = false;
    };
  }, [props.client, props.organizationId, query, queryKey]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onSelect(null);
    setFilters({
      ...(search.trim() === '' ? {} : { search: search.trim() }),
      ...(risk === '' ? {} : { riskLevel: risk as RiskLevel }),
      ...(connectivity === '' ? {} : { connectivityStatus: connectivity as ConnectivityStatus }),
      sort,
    });
  }

  function reset() {
    setSearch('');
    setRisk('');
    setConnectivity('');
    setSort('name:asc');
    setFilters({ sort: 'name:asc' });
    props.onSelect(null);
  }

  async function loadMore() {
    if (current?.page.nextCursor === null || current === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await listMonitoringOverview(props.client, props.organizationId, {
        ...query,
        cursor: current.page.nextCursor,
        limit: 25,
      });
      const known = new Set(current.data.map((item) => item.monitoringPoint.id));
      setResult({
        data: [...current.data, ...next.data.filter((item) => !known.has(item.monitoringPoint.id))],
        page: next.page,
      });
    } catch (reason) {
      setFailure({
        key: queryKey,
        error: reason instanceof Error ? reason : new Error('Halaman berikutnya gagal dimuat.'),
      });
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <DashboardCard
      title="Monitoring Overview"
      description="Current state authoritative. Nilai stale tidak dipresentasikan sebagai kondisi terkini."
      className="min-w-0"
    >
      <form onSubmit={apply} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-semibold text-slate-700 xl:col-span-2">
          Cari titik monitoring
          <input
            className="field-input mt-1"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Select label="Risiko" value={risk} onChange={setRisk}>
          <option value="">Semua risiko</option>
          <option value="SAFE">Aman</option>
          <option value="WATCH">Waspada</option>
          <option value="DANGER">Bahaya</option>
          <option value="UNKNOWN">Tidak dapat ditentukan</option>
        </Select>
        <Select label="Koneksi" value={connectivity} onChange={setConnectivity}>
          <option value="">Semua koneksi</option>
          <option value="ONLINE">Terhubung</option>
          <option value="DELAYED">Data terlambat</option>
          <option value="OFFLINE">Tidak terhubung</option>
          <option value="UNKNOWN">Tidak diketahui</option>
        </Select>
        <Select
          label="Urutkan"
          value={sort}
          onChange={(value) => setSort(value as MonitoringOverviewSort)}
        >
          <option value="name:asc">Nama A–Z</option>
          <option value="name:desc">Nama Z–A</option>
          <option value="risk:desc">Risiko tertinggi</option>
          <option value="connectivity:desc">Gangguan koneksi</option>
          <option value="lastTelemetryAt:desc">Telemetry terbaru</option>
        </Select>
        <div className="flex gap-2 md:col-span-2 xl:col-span-5">
          <button type="submit" className="primary-button">
            Terapkan filter
          </button>
          <button type="button" className="secondary-button" onClick={reset}>
            Reset
          </button>
        </div>
      </form>

      <div className="mt-5">
        {current === null && error === null && <PanelSkeleton label="Memuat Monitoring Overview" />}
        {error !== null && (
          <PanelError
            title="Data monitoring tidak dapat dimuat."
            error={error}
            onRetry={() => {
              setFailure(null);
              setRetry((value) => value + 1);
            }}
          />
        )}
        {current?.data.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
            Tidak ada titik monitoring yang sesuai. UI tidak membuat nilai sensor pengganti.
          </p>
        )}
        {current !== null && current.data.length > 0 && (
          <div className="overflow-x-auto" data-testid="monitoring-responsive-table">
            <table className="min-w-[68rem] w-full text-left text-sm">
              <thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th scope="col" className="p-3">
                    Titik / Site
                  </th>
                  <th scope="col" className="p-3">
                    Perangkat
                  </th>
                  <th scope="col" className="p-3">
                    Risiko / Koneksi
                  </th>
                  <th scope="col" className="p-3">
                    Sensor terakhir
                  </th>
                  <th scope="col" className="p-3">
                    Waktu / Alert
                  </th>
                  <th scope="col" className="p-3">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {current.data.map((item) => (
                  <MonitoringRow
                    key={item.monitoringPoint.id}
                    item={item}
                    selected={props.selected?.monitoringPoint.id === item.monitoringPoint.id}
                    onSelect={() => props.onSelect(item)}
                    onHistory={() => setHistory(item)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {current?.page.nextCursor !== null && (
          <button
            type="button"
            className="secondary-button mt-4"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
          </button>
        )}
      </div>
      {history !== null && (
        <RiskAssessmentDialog
          client={props.client}
          organizationId={props.organizationId}
          monitoringPointId={history.monitoringPoint.id}
          monitoringPointName={history.monitoringPoint.name}
          timezone={history.site.timezone}
          onClose={() => setHistory(null)}
        />
      )}
    </DashboardCard>
  );
}

function MonitoringRow({
  item,
  selected,
  onSelect,
  onHistory,
}: {
  readonly item: MonitoringOverviewItem;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onHistory: () => void;
}) {
  const fresh = item.currentState.connectivityStatus === 'ONLINE';
  const telemetry = item.latestTelemetry;
  return (
    <tr
      className={`border-b border-slate-100 align-top ${selected ? 'bg-blue-50' : ''}`}
      aria-selected={selected}
    >
      <td className="p-3">
        <strong>{item.monitoringPoint.name}</strong>
        <span className="mt-1 block text-xs text-slate-500">{item.site.name}</span>
      </td>
      <td className="p-3">
        {item.device?.displayName ?? 'Belum ada perangkat'}
        <span className="mt-1 block text-xs text-slate-500">{item.device?.hardwareId ?? '—'}</span>
      </td>
      <td className="p-3">
        <RiskBadge value={item.currentState.serverRisk} />
        <span className="mt-2 block text-xs font-semibold">
          {connectivityLabel(item.currentState.connectivityStatus)}
        </span>
        {!fresh && (
          <span className="mt-1 block text-[11px] font-bold text-amber-800">
            ⚠ Data bukan kondisi terkini
          </span>
        )}
      </td>
      <td className={`p-3 text-xs ${fresh ? '' : 'text-slate-500'}`}>
        {telemetry === null ? (
          'Belum ada telemetry'
        ) : (
          <>
            <span>{telemetry.tiltMagnitudeDeg}°</span>
            <span className="block">
              {telemetry.soilMoisturePct}% · {telemetry.rainfallMmHour} mm/jam
            </span>
          </>
        )}
      </td>
      <td className="p-3 text-xs">
        {formatSiteTimestamp(item.currentState.lastTelemetryAt, item.site.timezone)}
        <span className="mt-1 block font-semibold">
          {item.currentState.activeAlertSummary.count} alert aktif
        </span>
      </td>
      <td className="p-3">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="secondary-button"
            aria-pressed={selected}
            onClick={onSelect}
          >
            {selected ? 'Dipilih untuk grafik' : 'Pilih untuk grafik'}
          </button>
          <button type="button" className="secondary-button" onClick={onHistory}>
            Lihat riwayat penilaian
          </button>
        </div>
      </td>
    </tr>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly children: ReactNode;
}) {
  return (
    <label className="text-xs font-semibold text-slate-700">
      {label}
      <select
        className="field-input mt-1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
