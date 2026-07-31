'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import type { Role } from '../auth/auth-types';
import type { Site } from '../sites/site-contracts';
import { listSites } from '../sites/sites-api';
import { MonitoringPointDetailDialog, formatTimestamp } from './monitoring-point-detail-dialog';
import { MonitoringPointCreateDialog } from './monitoring-point-form-dialog';
import type { MonitoringPoint, MonitoringPointSort } from './monitoring-point-contracts';
import { listMonitoringPoints } from './monitoring-points-api';

interface MonitoringPointsManagerProps {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly role: Role;
}

interface ListResult {
  readonly key: string;
  readonly status: 'ready' | 'error';
  readonly items: readonly MonitoringPoint[];
  readonly nextCursor: string | null;
  readonly error?: Error;
}

interface SiteResult {
  readonly organizationId: string;
  readonly items: readonly Site[];
  readonly nextCursor: string | null;
  readonly status: 'ready' | 'error';
}

interface Filters {
  readonly search?: string;
  readonly siteId?: string;
  readonly isActive?: boolean;
  readonly sort: MonitoringPointSort;
}

const initialFilters: Filters = { sort: 'updatedAt:desc' };

export function MonitoringPointsManager({
  client,
  organizationId,
  role,
}: MonitoringPointsManagerProps) {
  const [searchInput, setSearchInput] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [sort, setSort] = useState<MonitoringPointSort>('updatedAt:desc');
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [retry, setRetry] = useState(0);
  const [reload, setReload] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [result, setResult] = useState<ListResult | null>(null);
  const [siteResult, setSiteResult] = useState<SiteResult | null>(null);
  const [siteLoadingMore, setSiteLoadingMore] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const queryKey = JSON.stringify([organizationId, filters, retry, reload]);
  const current = result?.key === queryKey ? result : null;
  const currentSites = siteResult?.organizationId === organizationId ? siteResult : null;
  const hasFilters =
    filters.search !== undefined ||
    filters.siteId !== undefined ||
    filters.isActive !== undefined ||
    filters.sort !== initialFilters.sort;

  useEffect(() => {
    let active = true;
    void listMonitoringPoints(client, organizationId, {
      ...filters,
      limit: 25,
    })
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
          error: reason instanceof Error ? reason : new Error('Data tidak dapat dimuat.'),
        });
      });

    return () => {
      active = false;
    };
  }, [client, filters, organizationId, queryKey]);

  useEffect(() => {
    let active = true;
    void listSites(client, organizationId, { limit: 100, sort: 'name:asc' })
      .then((response) => {
        if (!active) return;
        setSiteResult({
          organizationId,
          status: 'ready',
          items: response.data,
          nextCursor: response.page.nextCursor,
        });
      })
      .catch(() => {
        if (!active) return;
        setSiteResult({
          organizationId,
          status: 'error',
          items: [],
          nextCursor: null,
        });
      });
    return () => {
      active = false;
    };
  }, [client, organizationId]);

  const sitesById = useMemo(
    () => new Map((currentSites?.items ?? []).map((site) => [site.id, site])),
    [currentSites?.items],
  );

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFeedback(null);
    setFilters({
      ...(searchInput.trim().length === 0 ? {} : { search: searchInput.trim() }),
      ...(siteFilter.length === 0 ? {} : { siteId: siteFilter }),
      ...(activeFilter.length === 0 ? {} : { isActive: activeFilter === 'true' }),
      sort,
    });
  }

  function resetFilters(): void {
    setSearchInput('');
    setSiteFilter('');
    setActiveFilter('');
    setSort('updatedAt:desc');
    setFilters(initialFilters);
    setFeedback(null);
  }

  async function loadMore(): Promise<void> {
    if (current?.status !== 'ready' || current.nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await listMonitoringPoints(client, organizationId, {
        ...filters,
        cursor: current.nextCursor,
        limit: 25,
      });
      setResult((existing) => {
        if (existing?.key !== queryKey) return existing;
        const knownIds = new Set(existing.items.map((point) => point.id));
        return {
          key: queryKey,
          status: 'ready',
          items: [...existing.items, ...response.data.filter((point) => !knownIds.has(point.id))],
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

  async function loadMoreSites(): Promise<void> {
    if (currentSites?.status !== 'ready' || currentSites.nextCursor === null || siteLoadingMore) {
      return;
    }
    setSiteLoadingMore(true);
    try {
      const response = await listSites(client, organizationId, {
        cursor: currentSites.nextCursor,
        limit: 100,
        sort: 'name:asc',
      });
      setSiteResult((existing) => {
        if (existing?.organizationId !== organizationId) return existing;
        const knownIds = new Set(existing.items.map((site) => site.id));
        return {
          organizationId,
          status: 'ready',
          items: [...existing.items, ...response.data.filter((site) => !knownIds.has(site.id))],
          nextCursor: response.page.nextCursor,
        };
      });
    } catch {
      setSiteResult((existing) =>
        existing?.organizationId === organizationId ? { ...existing, status: 'error' } : existing,
      );
    } finally {
      setSiteLoadingMore(false);
    }
  }

  function mutationCompleted(message: string): void {
    setCreateOpen(false);
    setDetailId(null);
    setFeedback(message);
    setReload((value) => value + 1);
  }

  return (
    <section aria-labelledby="monitoring-points-heading" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="monitoring-points-heading" className="text-lg font-bold text-slate-950">
            Daftar titik monitoring
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Kelola lokasi pemantauan tanpa menghapus histori yang telah tersimpan.
          </p>
        </div>
        {role === 'PROJECT_OWNER' && (
          <button type="button" onClick={() => setCreateOpen(true)} className="primary-button">
            Tambah titik monitoring
          </button>
        )}
      </div>

      {feedback !== null && (
        <div role="status" aria-live="polite" className="success-banner">
          {feedback}
        </div>
      )}

      <form
        aria-label="Filter titik monitoring"
        onSubmit={applyFilters}
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-5"
      >
        <FilterField label="Cari" htmlFor="point-search">
          <input
            id="point-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            maxLength={100}
            placeholder="Nama atau lokasi"
            className="auth-input"
          />
        </FilterField>
        <FilterField label="Site" htmlFor="point-site-filter">
          <select
            id="point-site-filter"
            value={siteFilter}
            onChange={(event) => setSiteFilter(event.target.value)}
            className="auth-input"
          >
            <option value="">Semua Site</option>
            {(currentSites?.items ?? []).map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          {currentSites?.nextCursor !== null && currentSites?.nextCursor !== undefined && (
            <button
              type="button"
              onClick={() => void loadMoreSites()}
              disabled={siteLoadingMore}
              className="mt-1 text-xs font-bold text-blue-700 underline"
            >
              {siteLoadingMore ? 'Memuat…' : 'Muat Site lainnya'}
            </button>
          )}
          {currentSites?.status === 'error' && (
            <p role="alert" className="mt-1 text-xs text-red-700">
              Pilihan Site tidak dapat dimuat.
            </p>
          )}
        </FilterField>
        <FilterField label="Status" htmlFor="point-active-filter">
          <select
            id="point-active-filter"
            value={activeFilter}
            onChange={(event) => setActiveFilter(event.target.value)}
            className="auth-input"
          >
            <option value="">Semua status</option>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </FilterField>
        <FilterField label="Urutkan" htmlFor="point-sort">
          <select
            id="point-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as MonitoringPointSort)}
            className="auth-input"
          >
            <option value="updatedAt:desc">Terakhir diperbarui</option>
            <option value="createdAt:desc">Terbaru dibuat</option>
            <option value="createdAt:asc">Terlama dibuat</option>
            <option value="name:asc">Nama A–Z</option>
            <option value="name:desc">Nama Z–A</option>
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

      {current === null && <MonitoringPointSkeleton />}
      {current?.status === 'error' && (
        <div role="alert" className="error-banner">
          <p>Data titik monitoring tidak dapat dimuat.</p>
          {current.error instanceof ApiClientError && current.error.requestId !== undefined && (
            <p className="mt-1 text-xs">Request ID: {current.error.requestId}</p>
          )}
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="mt-2 font-bold underline"
          >
            Coba lagi
          </button>
        </div>
      )}
      {current?.status === 'ready' && current.items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h3 className="font-bold text-slate-900">
            {hasFilters ? 'Tidak ada hasil yang sesuai' : 'Belum ada titik monitoring'}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            {hasFilters
              ? 'Ubah atau reset filter untuk melihat data lainnya.'
              : 'Titik monitoring pertama dapat ditambahkan oleh Project Owner.'}
          </p>
        </div>
      )}
      {current?.status === 'ready' && current.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Titik monitoring</th>
                  <th className="px-4 py-3">Site dan lokasi</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Perangkat aktif</th>
                  <th className="px-4 py-3">Diperbarui</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {current.items.map((point) => (
                  <MonitoringPointRow
                    key={point.id}
                    point={point}
                    site={sitesById.get(point.siteId)}
                    onOpen={() => setDetailId(point.id)}
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

      {createOpen && (
        <MonitoringPointCreateDialog
          client={client}
          organizationId={organizationId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => mutationCompleted('Titik monitoring berhasil ditambahkan.')}
        />
      )}
      {detailId !== null && (
        <MonitoringPointDetailDialog
          client={client}
          organizationId={organizationId}
          monitoringPointId={detailId}
          role={role}
          sites={currentSites?.items ?? []}
          onClose={() => setDetailId(null)}
          onChanged={mutationCompleted}
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

function MonitoringPointRow({
  point,
  site,
  onOpen,
}: {
  readonly point: MonitoringPoint;
  readonly site: Site | undefined;
  onOpen(): void;
}) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-4 font-bold text-slate-900">{point.name}</td>
      <td className="px-4 py-4">
        <span className="font-semibold text-slate-800">{site?.name ?? point.siteId}</span>
        <span className="mt-1 block text-slate-500">
          {point.locationDescription ?? 'Lokasi belum dideskripsikan'}
        </span>
      </td>
      <td className="px-4 py-4">
        <span className="status-pill">{point.isActive ? 'Aktif' : 'Nonaktif'}</span>
      </td>
      <td className="px-4 py-4 text-slate-600">
        {point.currentDevice === null ? (
          'Belum ada perangkat'
        ) : (
          <>
            <span className="block font-semibold text-slate-800">
              {point.currentDevice.displayName}
            </span>
            <span className="block">{point.currentDevice.hardwareId}</span>
            <span className="block">
              Terlihat: {formatTimestamp(point.currentDevice.lastSeenAt)}
            </span>
          </>
        )}
      </td>
      <td className="px-4 py-4 text-slate-600">{formatTimestamp(point.updatedAt)}</td>
      <td className="px-4 py-4 text-right">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Lihat detail ${point.name}`}
          className="secondary-button whitespace-nowrap"
        >
          Detail
        </button>
      </td>
    </tr>
  );
}

function MonitoringPointSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-3 rounded-2xl bg-white p-5">
      <span className="sr-only">Memuat titik monitoring…</span>
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}
