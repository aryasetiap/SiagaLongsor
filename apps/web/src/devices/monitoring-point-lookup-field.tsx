'use client';

import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import type { MonitoringPoint } from '../monitoring-points/monitoring-point-contracts';
import { listMonitoringPoints } from '../monitoring-points/monitoring-points-api';

interface MonitoringPointLookupFieldProps {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly siteId: string;
  readonly value: string;
  readonly error?: string | undefined;
  readonly idPrefix: string;
  onChange(monitoringPointId: string): void;
}

interface LookupResult {
  readonly key: string;
  readonly items: readonly MonitoringPoint[];
  readonly nextCursor: string | null;
  readonly status: 'ready' | 'error';
  readonly error?: Error;
}

export function MonitoringPointLookupField({
  client,
  organizationId,
  siteId,
  value,
  error,
  idPrefix,
  onChange,
}: MonitoringPointLookupFieldProps) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [retry, setRetry] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const key = `${organizationId}\u0000${siteId}\u0000${search}\u0000${retry}`;
  const current = result?.key === key ? result : null;

  useEffect(() => {
    if (siteId.length === 0) return;
    let active = true;
    void listMonitoringPoints(client, organizationId, {
      siteId,
      isActive: true,
      ...(search.length === 0 ? {} : { search }),
      limit: 25,
      sort: 'name:asc',
    })
      .then((response) => {
        if (!active) return;
        setResult({
          key,
          status: 'ready',
          items: response.data,
          nextCursor: response.page.nextCursor,
        });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setResult({
          key,
          status: 'error',
          items: [],
          nextCursor: null,
          error:
            reason instanceof Error ? reason : new Error('Titik monitoring tidak dapat dimuat.'),
        });
      });
    return () => {
      active = false;
    };
  }, [client, key, organizationId, search, siteId]);

  const selectedExists = useMemo(
    () => current?.items.some((point) => point.id === value) ?? false,
    [current?.items, value],
  );

  function submitSearch(): void {
    onChange('');
    setSearch(searchInput.trim());
  }

  async function loadMore(): Promise<void> {
    if (current?.status !== 'ready' || current.nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await listMonitoringPoints(client, organizationId, {
        siteId,
        isActive: true,
        ...(search.length === 0 ? {} : { search }),
        cursor: current.nextCursor,
        limit: 25,
        sort: 'name:asc',
      });
      setResult((existing) => {
        if (existing?.key !== key) return existing;
        const known = new Set(existing.items.map((point) => point.id));
        return {
          key,
          status: 'ready',
          items: [...existing.items, ...response.data.filter((point) => !known.has(point.id))],
          nextCursor: response.page.nextCursor,
        };
      });
    } catch (reason) {
      setResult({
        key,
        status: 'error',
        items: current.items,
        nextCursor: current.nextCursor,
        error: reason instanceof Error ? reason : new Error('Titik monitoring tidak dapat dimuat.'),
      });
    } finally {
      setLoadingMore(false);
    }
  }

  const searchId = `${idPrefix}-monitoring-point-search`;
  const selectId = `${idPrefix}-monitoring-point-id`;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-slate-800">Titik monitoring</legend>
      {siteId.length === 0 ? (
        <p className="text-sm text-slate-500">Pilih Site terlebih dahulu.</p>
      ) : (
        <>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor={searchId}>
              Cari titik monitoring
            </label>
            <input
              id={searchId}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitSearch();
                }
              }}
              maxLength={100}
              placeholder="Cari titik monitoring"
              className="auth-input min-w-0 flex-1"
            />
            <button type="button" onClick={submitSearch} className="secondary-button">
              Cari
            </button>
          </div>
          {current === null && (
            <p role="status" aria-live="polite" className="text-sm text-slate-500">
              Memuat titik monitoring…
            </p>
          )}
          {current?.status === 'error' && (
            <div className="error-banner" role="alert">
              <p>Titik monitoring tidak dapat dimuat.</p>
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
          {current?.status === 'ready' && (
            <>
              <label className="sr-only" htmlFor={selectId}>
                Pilih titik monitoring
              </label>
              <select
                id={selectId}
                value={selectedExists ? value : ''}
                onChange={(event) => onChange(event.target.value)}
                aria-invalid={error !== undefined}
                aria-describedby={error === undefined ? undefined : `${selectId}-error`}
                className="auth-input"
              >
                <option value="">Pilih titik monitoring</option>
                {current.items.map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.name}
                  </option>
                ))}
              </select>
              {current.items.length === 0 && (
                <p className="text-sm text-slate-500">
                  Tidak ada titik monitoring aktif yang cocok.
                </p>
              )}
              {current.nextCursor !== null && (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                  className="text-sm font-bold text-blue-700 underline"
                >
                  {loadingMore ? 'Memuat…' : 'Muat lebih banyak titik'}
                </button>
              )}
            </>
          )}
        </>
      )}
      {error !== undefined && (
        <p id={`${selectId}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
