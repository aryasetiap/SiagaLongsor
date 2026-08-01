'use client';

import { type FormEvent, useEffect, useState } from 'react';

import type { ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { listAuditLogs } from './audit-api';
import type { AuditLogEntry, AuditLogQuery } from './audit-contracts';

export function AuditLogManager({
  client,
  organizationId,
}: {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
}) {
  const [eventType, setEventType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState<AuditLogQuery>({});
  const [result, setResult] = useState<ListEnvelope<AuditLogEntry> | null>(null);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    void listAuditLogs(client, organizationId, { ...query, limit: 25 })
      .then((response) => {
        if (active) {
          setResult(response);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [client, organizationId, query]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery({
      ...(eventType.trim() === '' ? {} : { eventType: eventType.trim() }),
      ...(entityType.trim() === '' ? {} : { entityType: entityType.trim() }),
      ...(entityId.trim() === '' ? {} : { entityId: entityId.trim() }),
      ...(actorId.trim() === '' ? {} : { actorId: actorId.trim() }),
      ...(from === '' ? {} : { from: new Date(from).toISOString() }),
      ...(to === '' ? {} : { to: new Date(to).toISOString() }),
    });
  }

  function reset() {
    setEventType('');
    setEntityType('');
    setEntityId('');
    setActorId('');
    setFrom('');
    setTo('');
    setQuery({});
  }

  async function loadMore() {
    if (result === null || result.page.nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await listAuditLogs(client, organizationId, {
        ...query,
        cursor: result.page.nextCursor,
        limit: 25,
      });
      setResult({ data: [...result.data, ...next.data], page: next.page });
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={apply}
        className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-3"
      >
        <Filter label="Jenis event" value={eventType} onChange={setEventType} />
        <Filter label="Jenis entitas" value={entityType} onChange={setEntityType} />
        <Filter label="ID entitas" value={entityId} onChange={setEntityId} />
        <Filter label="ID aktor" value={actorId} onChange={setActorId} />
        <Filter label="Dari" value={from} onChange={setFrom} type="datetime-local" />
        <Filter label="Sampai" value={to} onChange={setTo} type="datetime-local" />
        <div className="flex gap-2 md:col-span-3">
          <button className="primary-button" type="submit">
            Terapkan
          </button>
          <button className="secondary-button" type="button" onClick={reset}>
            Reset
          </button>
        </div>
      </form>
      {result === null && !error && <p aria-live="polite">Memuat audit log…</p>}
      {error && (
        <p role="alert" className="error-banner">
          Audit log tidak dapat dimuat.
        </p>
      )}
      {result?.data.length === 0 && (
        <p className="rounded-2xl bg-white p-8 text-center text-sm">
          Belum ada audit log yang sesuai.
        </p>
      )}
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
        {result !== null && result.data.length > 0 && (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-4">Event</th>
                <th className="p-4">Aktor</th>
                <th className="p-4">Entitas</th>
                <th className="p-4">Ringkasan aman</th>
                <th className="p-4">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100">
                  <td className="p-4 font-semibold">{eventLabel(entry.eventType)}</td>
                  <td className="p-4">{entry.actor?.name ?? 'Sistem'}</td>
                  <td className="p-4">
                    {entry.entityType ?? '—'}
                    <br />
                    <span className="text-xs text-slate-500">{entry.entityId ?? '—'}</span>
                  </td>
                  <td className="p-4">
                    <AuditSummary entry={entry} />
                  </td>
                  <td className="p-4 text-xs">
                    {new Date(entry.createdAt).toLocaleString('id-ID')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {result?.page.nextCursor !== null && result !== null && (
        <button
          type="button"
          className="secondary-button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? 'Memuat…' : 'Muat berikutnya'}
        </button>
      )}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  type = 'text',
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: string;
}) {
  return (
    <label className="text-xs font-semibold">
      {label}
      <input
        className="field-input mt-1"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function AuditSummary({ entry }: { readonly entry: AuditLogEntry }) {
  const metadata = entry.metadata;
  const value =
    metadata.resolutionNote ?? metadata.reason ?? metadata.note ?? metadata.fieldCondition;
  return <span>{value ?? humanize(entry.eventType)}</span>;
}

function eventLabel(value: string): string {
  return humanize(value);
}
function humanize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
