'use client';

import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import type { Site } from '../sites/site-contracts';
import { listSites } from '../sites/sites-api';

interface SiteLookupFieldProps {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly value: string;
  readonly error?: string | undefined;
  onChange(siteId: string): void;
}

interface SiteResult {
  readonly key: string;
  readonly items: readonly Site[];
  readonly nextCursor: string | null;
  readonly status: 'ready' | 'error';
  readonly error?: ApiClientError | Error;
}

export function SiteLookupField({
  client,
  organizationId,
  value,
  error,
  onChange,
}: SiteLookupFieldProps) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [retry, setRetry] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [result, setResult] = useState<SiteResult | null>(null);
  const key = `${organizationId}\u0000${search}\u0000${retry}`;
  const current = result?.key === key ? result : null;

  useEffect(() => {
    let active = true;
    void listSites(client, organizationId, {
      ...(search.length === 0 ? {} : { search }),
      limit: 25,
      sort: 'name:asc',
    })
      .then((response) => {
        if (!active) return;
        setResult({
          key,
          items: response.data,
          nextCursor: response.page.nextCursor,
          status: 'ready',
        });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setResult({
          key,
          items: [],
          nextCursor: null,
          status: 'error',
          error: reason instanceof Error ? reason : new Error('Site tidak dapat dimuat.'),
        });
      });

    return () => {
      active = false;
    };
  }, [client, key, organizationId, search]);

  const selectedExists = useMemo(
    () => current?.items.some((site) => site.id === value) ?? false,
    [current?.items, value],
  );

  function submitSearch() {
    onChange('');
    setSearch(searchInput.trim());
  }

  async function loadMore(): Promise<void> {
    if (current?.status !== 'ready' || current.nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await listSites(client, organizationId, {
        ...(search.length === 0 ? {} : { search }),
        cursor: current.nextCursor,
        limit: 25,
        sort: 'name:asc',
      });
      setResult((existing) => {
        if (existing?.key !== key) return existing;
        const knownIds = new Set(existing.items.map((site) => site.id));
        return {
          key,
          status: 'ready',
          items: [...existing.items, ...response.data.filter((site) => !knownIds.has(site.id))],
          nextCursor: response.page.nextCursor,
        };
      });
    } catch (reason) {
      setResult({
        key,
        items: current.items,
        nextCursor: current.nextCursor,
        status: 'error',
        error: reason instanceof Error ? reason : new Error('Site tidak dapat dimuat.'),
      });
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-slate-800">Site</legend>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="site-search">
          Cari Site
        </label>
        <input
          id="site-search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitSearch();
            }
          }}
          maxLength={100}
          placeholder="Cari nama atau alamat Site"
          className="auth-input min-w-0 flex-1"
        />
        <button type="button" onClick={submitSearch} className="secondary-button">
          Cari
        </button>
      </div>

      {current === null && (
        <p role="status" aria-live="polite" className="text-sm text-slate-500">
          Memuat pilihan Site…
        </p>
      )}
      {current?.status === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p>Site tidak dapat dimuat.</p>
          {current.error instanceof ApiClientError && current.error.requestId !== undefined && (
            <p className="mt-1 text-xs">Request ID: {current.error.requestId}</p>
          )}
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="mt-2 font-bold underline focus-visible:outline-2"
          >
            Coba lagi
          </button>
        </div>
      )}
      {current?.status === 'ready' && (
        <>
          <label className="sr-only" htmlFor="site-id">
            Pilih Site
          </label>
          <select
            id="site-id"
            value={selectedExists ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={error !== undefined}
            aria-describedby={error === undefined ? undefined : 'site-id-error'}
            className="auth-input"
          >
            <option value="">Pilih Site</option>
            {current.items.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
                {site.address === null ? '' : ` — ${site.address}`}
              </option>
            ))}
          </select>
          {current.items.length === 0 && (
            <p className="text-sm text-slate-500">Tidak ada Site yang cocok.</p>
          )}
          {current.nextCursor !== null && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="text-sm font-bold text-blue-700 underline focus-visible:outline-2 disabled:opacity-60"
            >
              {loadingMore ? 'Memuat Site…' : 'Muat lebih banyak Site'}
            </button>
          )}
        </>
      )}
      {error !== undefined && (
        <p id="site-id-error" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
