'use client';

import { type FormEvent, type ReactNode, useEffect, useState } from 'react';

import type { ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import type { Site } from '../sites/site-contracts';
import { listSites } from '../sites/sites-api';
import { listMonitoringOverview } from './risk-api';
import { RiskAssessmentDialog } from './risk-assessment-dialog';
import type {
  ConnectivityStatus,
  MonitoringOverviewItem,
  MonitoringOverviewQuery,
  MonitoringOverviewSort,
  RiskLevel,
} from './risk-contracts';
import {
  connectivityLabel,
  formatSiteTimestamp,
  reasonLabel,
  RiskBadge,
} from './risk-presentation';

interface Props {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
}

const initialFilters: MonitoringOverviewQuery = { sort: 'name:asc' };

export function MonitoringOverviewManager({ client, organizationId }: Props) {
  const [search, setSearch] = useState('');
  const [siteId, setSiteId] = useState('');
  const [risk, setRisk] = useState('');
  const [connectivity, setConnectivity] = useState('');
  const [sort, setSort] = useState<MonitoringOverviewSort>('name:asc');
  const [filters, setFilters] = useState<MonitoringOverviewQuery>(initialFilters);
  const [result, setResult] = useState<ListEnvelope<MonitoringOverviewItem> | null>(null);
  const [sites, setSites] = useState<readonly Site[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [retry, setRetry] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [history, setHistory] = useState<MonitoringOverviewItem | null>(null);
  const queryKey = JSON.stringify([organizationId, filters, retry]);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const current = resultKey === queryKey ? result : null;
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(initialFilters);

  useEffect(() => {
    let active = true;
    void listMonitoringOverview(client, organizationId, { ...filters, limit: 25 })
      .then((response) => {
        if (!active) return;
        setResult(response);
        setResultKey(queryKey);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason : new Error('Overview gagal dimuat.'));
        setResultKey(queryKey);
      });
    return () => {
      active = false;
    };
  }, [client, filters, organizationId, queryKey]);

  useEffect(() => {
    let active = true;
    void listSites(client, organizationId, { limit: 100, sort: 'name:asc' })
      .then((response) => {
        if (active) setSites(response.data);
      })
      .catch(() => {
        if (active) setSites([]);
      });
    return () => {
      active = false;
    };
  }, [client, organizationId]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({
      ...(search.trim() === '' ? {} : { search: search.trim() }),
      ...(siteId === '' ? {} : { siteId }),
      ...(risk === '' ? {} : { riskLevel: risk as RiskLevel }),
      ...(connectivity === '' ? {} : { connectivityStatus: connectivity as ConnectivityStatus }),
      sort,
    });
  }

  function reset() {
    setSearch('');
    setSiteId('');
    setRisk('');
    setConnectivity('');
    setSort('name:asc');
    setFilters(initialFilters);
  }

  async function loadMore() {
    if (current === null || current.page.nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await listMonitoringOverview(client, organizationId, {
        ...filters,
        cursor: current.page.nextCursor,
        limit: 25,
      });
      const known = new Set(current.data.map((item) => item.monitoringPoint.id));
      setResult({
        data: [...current.data, ...next.data.filter((item) => !known.has(item.monitoringPoint.id))],
        page: next.page,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error('Halaman berikutnya gagal dimuat.'));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={apply} className="grid gap-3 lg:grid-cols-6">
          <label className="text-xs font-semibold text-slate-700 lg:col-span-2">
            Cari
            <input
              className="field-input mt-1"
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <Select label="Site" value={siteId} onChange={setSiteId}>
            <option value="">Semua Site</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
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
          <div className="flex gap-2 lg:col-span-6">
            <button className="primary-button" type="submit">
              Terapkan
            </button>
            <button className="secondary-button" type="button" onClick={reset}>
              Reset
            </button>
          </div>
        </form>
      </section>

      {current === null && error === null && <OverviewSkeleton />}
      {error !== null && (
        <div role="alert" className="error-banner mt-5">
          <p>Data monitoring tidak dapat dimuat.</p>
          {error instanceof ApiClientError && error.requestId !== undefined && (
            <p className="mt-1 text-xs">Request ID: {error.requestId}</p>
          )}
          <button
            type="button"
            className="secondary-button mt-3"
            onClick={() => {
              setError(null);
              setRetry((value) => value + 1);
            }}
          >
            Coba lagi
          </button>
        </div>
      )}
      {current?.data.length === 0 && (
        <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-bold text-slate-900">
            {hasFilters ? 'Tidak ada hasil yang sesuai' : 'Belum ada data monitoring'}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Data sensor tidak akan dibuat atau diperkirakan oleh UI.
          </p>
        </div>
      )}
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {current?.data.map((item) => (
          <OverviewCard
            key={item.monitoringPoint.id}
            item={item}
            onHistory={() => setHistory(item)}
          />
        ))}
      </div>
      {current?.page.nextCursor !== null && (
        <button
          type="button"
          className="secondary-button mt-5"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
        </button>
      )}
      {history !== null && (
        <RiskAssessmentDialog
          key={`${organizationId}:${history.monitoringPoint.id}`}
          client={client}
          organizationId={organizationId}
          monitoringPointId={history.monitoringPoint.id}
          monitoringPointName={history.monitoringPoint.name}
          timezone={history.site.timezone}
          onClose={() => setHistory(null)}
        />
      )}
    </>
  );
}

function OverviewCard({
  item,
  onHistory,
}: {
  readonly item: MonitoringOverviewItem;
  readonly onHistory: () => void;
}) {
  const isFresh = item.currentState.connectivityStatus === 'ONLINE';
  const telemetry = item.latestTelemetry;
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-950">{item.monitoringPoint.name}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {item.site.name} · {item.device?.displayName ?? 'Belum ada perangkat aktif'}
          </p>
        </div>
        <RiskBadge value={item.currentState.serverRisk} />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">
        {connectivityLabel(item.currentState.connectivityStatus)}
      </p>
      {!isFresh && telemetry !== null && (
        <p className="mt-1 text-xs font-semibold text-amber-800">
          Nilai berikut adalah rekaman terakhir, bukan kondisi terkini.
        </p>
      )}
      {telemetry === null ? (
        <p className="mt-4 text-sm text-slate-500">Data sensor belum tersedia.</p>
      ) : (
        <dl
          className={`mt-4 grid grid-cols-3 gap-3 ${isFresh ? '' : 'opacity-60'}`}
          aria-label={isFresh ? 'Sensor terkini' : 'Sensor terakhir yang sudah stale'}
        >
          <Sensor label="Kemiringan" value={`${telemetry.tiltMagnitudeDeg}°`} />
          <Sensor label="Kelembapan" value={`${telemetry.soilMoisturePct}%`} />
          <Sensor label="Curah hujan" value={`${telemetry.rainfallMmHour} mm/jam`} />
        </dl>
      )}
      <p className="mt-4 text-xs text-slate-600">
        {item.currentState.reasons.map(reasonLabel).join(' ')}
      </p>
      <dl className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
        <div>
          <dt className="font-semibold">Evaluasi</dt>
          <dd>{formatSiteTimestamp(item.currentState.evaluatedAt, item.site.timezone)}</dd>
        </div>
        <div>
          <dt className="font-semibold">Telemetry terakhir</dt>
          <dd>{formatSiteTimestamp(item.currentState.lastTelemetryAt, item.site.timezone)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-sm font-semibold text-slate-700">
          {item.currentState.activeAlertSummary.count} peringatan aktif
        </p>
        <button type="button" className="secondary-button" onClick={onHistory}>
          Lihat riwayat penilaian
        </button>
      </div>
    </article>
  );
}

function Sensor({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-slate-900">{value}</dd>
    </div>
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

function OverviewSkeleton() {
  return (
    <div aria-live="polite" aria-label="Memuat overview" className="mt-5 grid gap-4 xl:grid-cols-2">
      {[1, 2].map((item) => (
        <div
          key={item}
          className="h-64 animate-pulse rounded-3xl border border-slate-200 bg-white"
        />
      ))}
    </div>
  );
}
