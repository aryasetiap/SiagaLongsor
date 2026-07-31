'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import type { Role } from '../auth/auth-types';
import type { MonitoringPoint } from '../monitoring-points/monitoring-point-contracts';
import { formatTimestamp } from '../monitoring-points/monitoring-point-detail-dialog';
import { listMonitoringPoints } from '../monitoring-points/monitoring-points-api';
import type { Site } from '../sites/site-contracts';
import { listSites } from '../sites/sites-api';
import { DeviceDetailDialog, formatLifecycle, formatNetwork } from './device-detail-dialog';
import { DeviceRegisterDialog } from './device-register-dialog';
import type {
  Device,
  DeviceCredentialData,
  DeviceLifecycleStatus,
  DeviceSort,
} from './device-contracts';
import { listDevices } from './devices-api';
import { OneTimeCredentialDialog } from './one-time-credential-dialog';

interface DevicesManagerProps {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly role: Role;
}

interface Filters {
  readonly search?: string;
  readonly siteId?: string;
  readonly monitoringPointId?: string;
  readonly lifecycleStatus?: DeviceLifecycleStatus;
  readonly sort: DeviceSort;
}

interface ListResult {
  readonly key: string;
  readonly status: 'ready' | 'error';
  readonly items: readonly Device[];
  readonly nextCursor: string | null;
  readonly error?: Error;
}

interface LookupResult {
  readonly organizationId: string;
  readonly sites: readonly Site[];
  readonly monitoringPoints: readonly MonitoringPoint[];
}

const initialFilters: Filters = { sort: 'updatedAt:desc' };

export function DevicesManager({ client, organizationId, role }: DevicesManagerProps) {
  const [searchInput, setSearchInput] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [pointFilter, setPointFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState<DeviceSort>('updatedAt:desc');
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [retry, setRetry] = useState(0);
  const [reload, setReload] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [result, setResult] = useState<ListResult | null>(null);
  const [lookups, setLookups] = useState<LookupResult | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [credential, setCredential] = useState<DeviceCredentialData | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const queryKey = JSON.stringify([organizationId, filters, retry, reload]);
  const current = result?.key === queryKey ? result : null;
  const currentLookups = lookups?.organizationId === organizationId ? lookups : null;
  const hasFilters =
    filters.search !== undefined ||
    filters.siteId !== undefined ||
    filters.monitoringPointId !== undefined ||
    filters.lifecycleStatus !== undefined ||
    filters.sort !== initialFilters.sort;

  useEffect(() => {
    let active = true;
    void listDevices(client, organizationId, { ...filters, limit: 25 })
      .then((response) => {
        if (!active) return;
        setResult({
          key: queryKey,
          status: 'ready',
          items: response.data,
          nextCursor: response.page.nextCursor,
        });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setResult({
          key: queryKey,
          status: 'error',
          items: [],
          nextCursor: null,
          error: reason instanceof Error ? reason : new Error('Data perangkat tidak dapat dimuat.'),
        });
      });
    return () => {
      active = false;
    };
  }, [client, filters, organizationId, queryKey]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      listSites(client, organizationId, { limit: 100, sort: 'name:asc' }),
      listMonitoringPoints(client, organizationId, { limit: 100, sort: 'name:asc' }),
    ])
      .then(([sites, points]) => {
        if (!active) return;
        setLookups({
          organizationId,
          sites: sites.data,
          monitoringPoints: points.data,
        });
      })
      .catch(() => {
        if (!active) return;
        setLookups({ organizationId, sites: [], monitoringPoints: [] });
      });
    return () => {
      active = false;
    };
  }, [client, organizationId]);

  const siteNames = useMemo(
    () => new Map((currentLookups?.sites ?? []).map((site) => [site.id, site.name])),
    [currentLookups?.sites],
  );
  const pointNames = useMemo(
    () => new Map((currentLookups?.monitoringPoints ?? []).map((point) => [point.id, point.name])),
    [currentLookups?.monitoringPoints],
  );
  const filteredPoints = (currentLookups?.monitoringPoints ?? []).filter(
    (point) => siteFilter.length === 0 || point.siteId === siteFilter,
  );

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFeedback(null);
    setFilters({
      ...(searchInput.trim().length === 0 ? {} : { search: searchInput.trim() }),
      ...(siteFilter.length === 0 ? {} : { siteId: siteFilter }),
      ...(pointFilter.length === 0 ? {} : { monitoringPointId: pointFilter }),
      ...(statusFilter.length === 0
        ? {}
        : { lifecycleStatus: statusFilter as DeviceLifecycleStatus }),
      sort,
    });
  }

  function resetFilters(): void {
    setSearchInput('');
    setSiteFilter('');
    setPointFilter('');
    setStatusFilter('');
    setSort('updatedAt:desc');
    setFilters(initialFilters);
    setFeedback(null);
  }

  async function loadMore(): Promise<void> {
    if (current?.status !== 'ready' || current.nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await listDevices(client, organizationId, {
        ...filters,
        cursor: current.nextCursor,
        limit: 25,
      });
      setResult((existing) => {
        if (existing?.key !== queryKey) return existing;
        const known = new Set(existing.items.map((device) => device.id));
        return {
          key: queryKey,
          status: 'ready',
          items: [...existing.items, ...response.data.filter((device) => !known.has(device.id))],
          nextCursor: response.page.nextCursor,
        };
      });
    } catch (reason) {
      setResult({
        key: queryKey,
        status: 'error',
        items: current.items,
        nextCursor: current.nextCursor,
        error:
          reason instanceof Error ? reason : new Error('Halaman berikutnya tidak dapat dimuat.'),
      });
    } finally {
      setLoadingMore(false);
    }
  }

  function refresh(message: string): void {
    setRegisterOpen(false);
    setDetailId(null);
    setFeedback(message);
    setReload((number) => number + 1);
  }

  function showCredential(data: DeviceCredentialData): void {
    setRegisterOpen(false);
    setDetailId(null);
    setCredential(data);
    setReload((number) => number + 1);
  }

  return (
    <section aria-labelledby="devices-heading" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="devices-heading" className="text-lg font-bold text-slate-950">
            Daftar perangkat
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Kelola assignment dan lifecycle perangkat tanpa menghapus histori telemetry.
          </p>
        </div>
        {role === 'PROJECT_OWNER' && (
          <button type="button" onClick={() => setRegisterOpen(true)} className="primary-button">
            Daftarkan perangkat
          </button>
        )}
      </div>

      {feedback !== null && (
        <div role="status" aria-live="polite" className="success-banner">
          {feedback}
        </div>
      )}

      <form
        aria-label="Filter perangkat"
        onSubmit={applyFilters}
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 xl:grid-cols-6"
      >
        <FilterField label="Cari" htmlFor="device-search">
          <input
            id="device-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            maxLength={100}
            placeholder="Nama atau hardware ID"
            className="auth-input"
          />
        </FilterField>
        <FilterField label="Site" htmlFor="device-site-filter">
          <select
            id="device-site-filter"
            value={siteFilter}
            onChange={(event) => {
              setSiteFilter(event.target.value);
              setPointFilter('');
            }}
            className="auth-input"
          >
            <option value="">Semua Site</option>
            {(currentLookups?.sites ?? []).map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Titik monitoring" htmlFor="device-point-filter">
          <select
            id="device-point-filter"
            value={pointFilter}
            onChange={(event) => setPointFilter(event.target.value)}
            className="auth-input"
          >
            <option value="">Semua titik</option>
            {filteredPoints.map((point) => (
              <option key={point.id} value={point.id}>
                {point.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Lifecycle" htmlFor="device-status-filter">
          <select
            id="device-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="auth-input"
          >
            <option value="">Semua status</option>
            <option value="ENABLED">Aktif</option>
            <option value="DISABLED">Dinonaktifkan</option>
          </select>
        </FilterField>
        <FilterField label="Urutkan" htmlFor="device-sort">
          <select
            id="device-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as DeviceSort)}
            className="auth-input"
          >
            <option value="updatedAt:desc">Terakhir diperbarui</option>
            <option value="createdAt:desc">Terbaru dibuat</option>
            <option value="createdAt:asc">Terlama dibuat</option>
            <option value="displayName:asc">Nama A–Z</option>
            <option value="displayName:desc">Nama Z–A</option>
            <option value="lastSeenAt:desc">Terakhir terlihat</option>
          </select>
        </FilterField>
        <div className="flex items-end gap-2">
          <button type="submit" className="primary-button flex-1">
            Terapkan
          </button>
          <button type="button" onClick={resetFilters} className="secondary-button flex-1">
            Reset
          </button>
        </div>
      </form>

      {current === null && <DeviceSkeleton />}
      {current?.status === 'error' && (
        <div className="error-banner" role="alert">
          <p>Data perangkat tidak dapat dimuat.</p>
          {current.error instanceof ApiClientError && current.error.requestId !== undefined && (
            <p className="mt-1 text-xs">Request ID: {current.error.requestId}</p>
          )}
          <button
            type="button"
            onClick={() => setRetry((number) => number + 1)}
            className="mt-2 font-bold underline"
          >
            Coba lagi
          </button>
        </div>
      )}
      {current?.status === 'ready' && current.items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h3 className="font-bold text-slate-900">
            {hasFilters ? 'Tidak ada perangkat yang sesuai' : 'Belum ada perangkat'}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            {hasFilters
              ? 'Ubah atau reset filter untuk melihat data lainnya.'
              : 'Perangkat pertama dapat didaftarkan oleh Project Owner.'}
          </p>
        </div>
      )}
      {current?.status === 'ready' && current.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Perangkat</th>
                  <th className="px-4 py-3">Assignment</th>
                  <th className="px-4 py-3">Lifecycle</th>
                  <th className="px-4 py-3">Firmware dan jaringan</th>
                  <th className="px-4 py-3">Aktivitas terakhir</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {current.items.map((device) => (
                  <DeviceRow
                    key={device.id}
                    device={device}
                    siteName={siteNames.get(device.siteId)}
                    pointName={pointNames.get(device.monitoringPointId)}
                    onOpen={() => setDetailId(device.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {current.nextCursor !== null && (
            <div className="flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                className="secondary-button"
              >
                {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
              </button>
            </div>
          )}
        </>
      )}

      {registerOpen && (
        <DeviceRegisterDialog
          client={client}
          organizationId={organizationId}
          onClose={() => setRegisterOpen(false)}
          onRegistered={showCredential}
        />
      )}
      {detailId !== null && (
        <DeviceDetailDialog
          client={client}
          organizationId={organizationId}
          deviceId={detailId}
          role={role}
          sites={currentLookups?.sites ?? []}
          monitoringPoints={currentLookups?.monitoringPoints ?? []}
          onClose={() => setDetailId(null)}
          onChanged={refresh}
          onCredential={showCredential}
        />
      )}
      {credential !== null && (
        <OneTimeCredentialDialog
          credential={credential.credential}
          onClose={() => {
            setCredential(null);
            setFeedback('Credential telah ditutup dan dihapus dari tampilan.');
          }}
        />
      )}
    </section>
  );
}

function FilterField({
  label,
  htmlFor,
  children,
}: {
  readonly label: string;
  readonly htmlFor: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-bold text-slate-600">
        {label}
      </label>
      {children}
    </div>
  );
}

function DeviceRow({
  device,
  siteName,
  pointName,
  onOpen,
}: {
  readonly device: Device;
  readonly siteName: string | undefined;
  readonly pointName: string | undefined;
  onOpen(): void;
}) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-4">
        <span className="block font-bold text-slate-900">{device.displayName}</span>
        <span className="mt-1 block font-mono text-xs text-slate-500">{device.hardwareId}</span>
      </td>
      <td className="px-4 py-4 text-slate-600">
        <span className="block font-semibold text-slate-800">{siteName ?? device.siteId}</span>
        <span className="mt-1 block">{pointName ?? device.monitoringPointId}</span>
      </td>
      <td className="px-4 py-4">
        <span className="status-pill">{formatLifecycle(device.lifecycleStatus)}</span>
      </td>
      <td className="px-4 py-4 text-slate-600">
        <span className="block">{device.firmwareVersion ?? 'Firmware belum tersedia'}</span>
        <span className="mt-1 block">
          {device.lastNetwork === null
            ? 'Jaringan belum tersedia'
            : `${formatNetwork(device.lastNetwork.type)} · RSSI ${device.lastNetwork.signalRssi ?? 'belum tersedia'}`}
        </span>
      </td>
      <td className="px-4 py-4 text-slate-600">
        <span className="block">Terlihat: {formatTimestamp(device.lastSeenAt)}</span>
        <span className="mt-1 block">Telemetry: {formatTimestamp(device.lastTelemetryAt)}</span>
      </td>
      <td className="px-4 py-4 text-right">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Lihat detail ${device.displayName}`}
          className="secondary-button whitespace-nowrap"
        >
          Detail
        </button>
      </td>
    </tr>
  );
}

function DeviceSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-3 rounded-2xl bg-white p-5">
      <span className="sr-only">Memuat perangkat…</span>
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}
