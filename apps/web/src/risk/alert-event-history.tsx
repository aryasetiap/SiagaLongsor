'use client';

import { useEffect, useState } from 'react';

import type { ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { listAlertEvents } from './risk-api';
import type { AlertEvent } from './risk-contracts';

export function AlertEventHistory({
  client,
  organizationId,
  alertId,
  refreshGeneration,
}: {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly alertId: string;
  readonly refreshGeneration: number;
}) {
  const [result, setResult] = useState<ListEnvelope<AlertEvent> | null>(null);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    void listAlertEvents(client, organizationId, alertId, { limit: 25 })
      .then((response) => {
        if (!active) return;
        setResult(response);
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [alertId, client, organizationId, refreshGeneration]);

  async function loadMore() {
    if (result?.page.nextCursor === null || result === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await listAlertEvents(client, organizationId, alertId, {
        cursor: result.page.nextCursor,
        limit: 25,
      });
      const known = new Set(result.data.map((event) => event.id));
      setResult({
        data: [...result.data, ...next.data.filter((event) => !known.has(event.id))],
        page: next.page,
      });
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section aria-labelledby="alert-history-title" className="mt-5 border-t border-slate-200 pt-5">
      <h3 id="alert-history-title" className="font-bold text-slate-950">
        Riwayat lifecycle
      </h3>
      {result === null && !error && <p className="mt-3 text-sm text-slate-600">Memuat histori…</p>}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          Histori tidak dapat dimuat.
        </p>
      )}
      {result?.data.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">Belum ada histori.</p>
      )}
      <ol className="mt-3 space-y-3">
        {result?.data.map((event) => (
          <li key={event.id} className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="font-bold">{eventLabel(event.eventType)}</p>
            <p className="mt-1 text-xs text-slate-600">
              {new Date(event.actedAt ?? event.observedAt ?? event.createdAt).toLocaleString(
                'id-ID',
              )}
              {event.actor == null ? '' : ` · ${event.actor.name}`}
            </p>
            <SafeMetadata event={event} />
          </li>
        ))}
      </ol>
      {result?.page.nextCursor !== null && result !== null && (
        <button
          type="button"
          className="secondary-button mt-3"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? 'Memuat…' : 'Muat histori berikutnya'}
        </button>
      )}
    </section>
  );
}

function SafeMetadata({ event }: { readonly event: AlertEvent }) {
  const metadata = event.metadata ?? {};
  return (
    <dl className="mt-2 space-y-1 text-xs text-slate-700">
      {metadata.note !== undefined && <Row label="Catatan" value={metadata.note} />}
      {metadata.fieldCondition !== undefined && (
        <Row label="Kondisi lapangan" value={metadata.fieldCondition} />
      )}
      {metadata.sopExecuted !== undefined && (
        <Row label="SOP dijalankan" value={metadata.sopExecuted ? 'Ya' : 'Belum'} />
      )}
      {metadata.resolutionNote !== undefined && (
        <Row label="Penyelesaian" value={metadata.resolutionNote} />
      )}
      {metadata.reason !== undefined && <Row label="Alasan" value={metadata.reason} />}
    </dl>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="inline font-semibold">{label}: </dt>
      <dd className="inline">{value}</dd>
    </div>
  );
}

function eventLabel(eventType: AlertEvent['eventType']): string {
  return {
    CREATED: 'Peringatan dibuat',
    OBSERVED: 'Kondisi diamati kembali',
    CONNECTIVITY_TRANSITION: 'Perubahan konektivitas diamati',
    ALERT_ACKNOWLEDGED: 'Peringatan dikonfirmasi',
    ALERT_RESOLVED: 'Peringatan diselesaikan',
    ALERT_FALSE_ALARM: 'Ditandai sebagai alarm palsu',
  }[eventType];
}
