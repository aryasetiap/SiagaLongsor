'use client';

import { useEffect, useState } from 'react';

import type { DataEnvelope, ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { getAlert, listAlerts } from '../risk/risk-api';
import type { Alert } from '../risk/risk-contracts';
import {
  alertStatusLabel,
  alertTypeLabel,
  formatSiteTimestamp,
  reasonLabel,
  severityLabel,
} from '../risk/risk-presentation';
import { DashboardCard, PanelError, PanelSkeleton } from './panel-ui';

interface Props {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly siteId: string;
  readonly refreshGeneration: number;
}

export function RecentAlerts(props: Props) {
  const [result, setResult] = useState<ListEnvelope<Alert> | null>(null);
  const [failure, setFailure] = useState<{
    readonly key: string;
    readonly error: Error;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<DataEnvelope<Alert> | null>(null);
  const [detailError, setDetailError] = useState<Error | null>(null);
  const key = JSON.stringify([props.organizationId, props.siteId, props.refreshGeneration, retry]);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const current = resultKey === key ? result : null;
  const error = failure?.key === key ? failure.error : null;

  useEffect(() => {
    let active = true;
    void listAlerts(props.client, props.organizationId, {
      ...(props.siteId === '' ? {} : { siteId: props.siteId }),
      sort: 'lastObservedAt:desc',
      limit: 5,
    })
      .then((response) => {
        if (!active) return;
        setResult(response);
        setResultKey(key);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setFailure({
          key,
          error: reason instanceof Error ? reason : new Error('Peringatan gagal dimuat.'),
        });
        setResultKey(key);
      });
    return () => {
      active = false;
    };
  }, [key, props.client, props.organizationId, props.siteId]);

  async function openDetail(alertId: string) {
    setDetail(null);
    setDetailError(null);
    try {
      setDetail(await getAlert(props.client, props.organizationId, alertId));
    } catch (reason) {
      setDetailError(reason instanceof Error ? reason : new Error('Detail gagal dimuat.'));
    }
  }

  return (
    <DashboardCard
      title="Peringatan Terbaru"
      description="Daftar read-only; perubahan lifecycle tersedia pada fase berikutnya."
    >
      {current === null && error === null && <PanelSkeleton label="Memuat peringatan terbaru" />}
      {error !== null && (
        <PanelError
          title="Peringatan terbaru tidak dapat dimuat."
          error={error}
          onRetry={() => {
            setFailure(null);
            setRetry((value) => value + 1);
          }}
        />
      )}
      {current?.data.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
          Belum ada peringatan pada scope ini.
        </p>
      )}
      <div className="space-y-3">
        {current?.data.map((alert) => (
          <article
            key={alert.id}
            className={`rounded-2xl border p-4 ${alert.severity === 'CRITICAL' ? 'border-red-200 bg-red-50/40' : 'border-slate-200'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  <span aria-hidden="true">{alert.severity === 'CRITICAL' ? '!' : '△'} </span>
                  {alertTypeLabel(alert.type)}
                </h3>
                <p className="mt-1 text-xs font-semibold text-slate-600">
                  {severityLabel(alert.severity)} · {alertStatusLabel(alert.status)}
                </p>
              </div>
              <strong className="text-xs text-slate-700">{alert.occurrenceCount}×</strong>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {alert.monitoringPoint.name} · {alert.site.name}
            </p>
            <dl className="mt-2 grid gap-1 text-[11px] text-slate-500">
              <div>
                <dt className="inline font-semibold">Pertama: </dt>
                <dd className="inline">
                  {formatSiteTimestamp(alert.firstObservedAt, alert.site.timezone)}
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold">Terakhir: </dt>
                <dd className="inline">
                  {formatSiteTimestamp(alert.lastObservedAt, alert.site.timezone)}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className="secondary-button mt-3"
              onClick={() => void openDetail(alert.id)}
            >
              Lihat detail
            </button>
          </article>
        ))}
      </div>
      {(detail !== null || detailError !== null) && (
        <AlertDetail
          result={detail}
          error={detailError}
          onClose={() => {
            setDetail(null);
            setDetailError(null);
          }}
        />
      )}
    </DashboardCard>
  );
}

function AlertDetail({
  result,
  error,
  onClose,
}: {
  readonly result: DataEnvelope<Alert> | null;
  readonly error: Error | null;
  readonly onClose: () => void;
}) {
  const alert = result?.data;
  return (
    <div className="dialog-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-alert-title"
        className="dialog-panel"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="dashboard-alert-title" className="text-xl font-bold">
              Detail peringatan
            </h2>
            <p className="mt-1 text-sm text-slate-600">Informasi read-only dari server.</p>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Tutup
          </button>
        </div>
        {error !== null && (
          <div role="alert" className="error-banner mt-5">
            Detail tidak dapat dimuat.
          </div>
        )}
        {alert !== undefined && (
          <div className="mt-5 space-y-3">
            <p className="text-lg font-bold">{alertTypeLabel(alert.type)}</p>
            <p>
              {severityLabel(alert.severity)} · {alertStatusLabel(alert.status)}
            </p>
            <p className="text-sm">{alert.reasons.map(reasonLabel).join(' ')}</p>
            <p className="text-sm">
              Jumlah observasi: <strong>{alert.occurrenceCount}</strong>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
