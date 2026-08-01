'use client';

import { type ReactNode, useEffect, useState } from 'react';

import type { DataEnvelope, OrganizationApiClient } from '../api/contracts';
import { getDashboardSummary } from './dashboard-api';
import type { DashboardSummary, DashboardWindowHours } from './dashboard-contracts';
import { DashboardCard, PanelError, PanelSkeleton } from './panel-ui';

interface Props {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly siteId: string;
  readonly windowHours: DashboardWindowHours;
  readonly refreshGeneration: number;
  readonly overview: ReactNode;
}

export function SummaryPanel(props: Props) {
  const [result, setResult] = useState<DataEnvelope<DashboardSummary> | null>(null);
  const [failure, setFailure] = useState<{
    readonly key: string;
    readonly error: Error;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([
    props.organizationId,
    props.siteId,
    props.windowHours,
    props.refreshGeneration,
    retry,
  ]);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const current = resultKey === key ? (result?.data ?? null) : null;
  const error = failure?.key === key ? failure.error : null;

  useEffect(() => {
    let active = true;
    void getDashboardSummary(props.client, props.organizationId, {
      ...(props.siteId === '' ? {} : { siteId: props.siteId }),
      windowHours: props.windowHours,
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
          error: reason instanceof Error ? reason : new Error('Ringkasan gagal dimuat.'),
        });
        setResultKey(key);
      });
    return () => {
      active = false;
    };
  }, [key, props.client, props.organizationId, props.siteId, props.windowHours]);

  return (
    <div aria-live="polite" className="space-y-5">
      {current === null && error === null && (
        <PanelSkeleton
          label="Memuat ringkasan dashboard"
          className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
        />
      )}
      {error !== null && (
        <PanelError
          title="Ringkasan dashboard tidak dapat dimuat."
          error={error}
          onRetry={() => {
            setFailure(null);
            setRetry((value) => value + 1);
          }}
        />
      )}
      {current !== null && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Titik Monitoring Aktif"
              value={current.monitoringPoints.active}
              support={`${current.monitoringPoints.total} total · ${current.monitoringPoints.inactive} nonaktif`}
              icon="●"
            />
            <KpiCard
              label="Peringatan Kritis Aktif"
              value={current.alerts.activeCritical}
              support={`${current.alerts.active} seluruh peringatan aktif`}
              critical
              icon="!"
            />
            <KpiCard
              label="Perangkat Tidak Terhubung"
              value={current.connectivityDistribution.offline}
              support={`${current.connectivityDistribution.delayed} terlambat · ${current.connectivityDistribution.unknown} tidak diketahui`}
              icon="×"
            />
            <KpiCard
              label="Peringatan Baru"
              value={current.alerts.newInWindow}
              support={`Dalam ${current.window.hours} jam terakhir`}
              icon="+"
            />
          </div>
          <p className="text-right text-xs text-slate-500">
            Dihasilkan {formatTimestamp(current.generatedAt)} · rentang {current.window.hours} jam
          </p>
        </>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,1fr)]">
        <div className="min-w-0">{props.overview}</div>
        {current !== null ? (
          <RiskConnectivityCard summary={current} />
        ) : (
          <DashboardCard title="Distribusi Risiko">
            {error === null ? (
              <PanelSkeleton label="Memuat distribusi risiko" />
            ) : (
              <p className="text-sm text-slate-600">
                Distribusi tidak tersedia karena ringkasan gagal dimuat.
              </p>
            )}
          </DashboardCard>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  support,
  critical = false,
  icon,
}: {
  readonly label: string;
  readonly value: number;
  readonly support: string;
  readonly critical?: boolean;
  readonly icon: string;
}) {
  return (
    <article
      aria-label={`${label}: ${value}`}
      className={`rounded-3xl border bg-white p-5 shadow-sm ${critical ? 'border-red-200' : 'border-slate-200'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <span
          aria-hidden="true"
          className={`grid size-8 place-items-center rounded-xl font-black ${critical ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}
        >
          {icon}
        </span>
      </div>
      <p className={`mt-3 text-3xl font-black ${critical ? 'text-red-800' : 'text-slate-950'}`}>
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-600">{support}</p>
    </article>
  );
}

function RiskConnectivityCard({ summary }: { readonly summary: DashboardSummary }) {
  const buckets = [
    ['Aman', summary.riskDistribution.safe, '#15803d', '✓'],
    ['Waspada', summary.riskDistribution.watch, '#b45309', '△'],
    ['Bahaya', summary.riskDistribution.danger, '#b91c1c', '!'],
    ['Tidak dapat ditentukan', summary.riskDistribution.unknown, '#64748b', '?'],
  ] as const;
  const total = buckets.reduce((sum, bucket) => sum + bucket[1], 0);
  let offset = 0;
  const segments = buckets.map((bucket) => {
    const length = total === 0 ? 0 : (bucket[1] / total) * 100;
    const segment = { bucket, length, offset };
    offset += length;
    return segment;
  });
  return (
    <DashboardCard
      title="Distribusi Risiko"
      description="Current server risk untuk titik monitoring aktif."
    >
      {total === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-600">
          Belum ada titik aktif untuk divisualisasikan.
        </p>
      ) : (
        <div className="grid items-center gap-4 sm:grid-cols-[9rem_1fr] xl:grid-cols-1 2xl:grid-cols-[9rem_1fr]">
          <svg
            role="img"
            aria-label={`Distribusi risiko dari ${total} titik aktif: ${buckets.map(([label, value]) => `${label} ${value}`).join(', ')}`}
            viewBox="0 0 42 42"
            className="mx-auto size-36 -rotate-90"
          >
            <circle cx="21" cy="21" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="6" />
            {segments.map(({ bucket, length, offset: segmentOffset }) => (
              <circle
                key={bucket[0]}
                cx="21"
                cy="21"
                r="15.9"
                fill="none"
                stroke={bucket[2]}
                strokeWidth="6"
                strokeDasharray={`${length} ${100 - length}`}
                strokeDashoffset={-segmentOffset}
              >
                <title>
                  {bucket[0]}: {bucket[1]}
                </title>
              </circle>
            ))}
          </svg>
          <ul className="space-y-2 text-sm" aria-label="Legenda distribusi risiko">
            {buckets.map(([label, value, color, symbol]) => (
              <li key={label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" style={{ color }} className="font-black">
                    {symbol}
                  </span>
                  {label}
                </span>
                <strong>{value}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-bold text-slate-900">Konektivitas perangkat aktif</h3>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Connectivity
            label="Terhubung"
            value={summary.connectivityDistribution.online}
            symbol="●"
          />
          <Connectivity
            label="Data terlambat"
            value={summary.connectivityDistribution.delayed}
            symbol="◷"
          />
          <Connectivity
            label="Tidak terhubung"
            value={summary.connectivityDistribution.offline}
            symbol="×"
          />
          <Connectivity
            label="Tidak diketahui"
            value={summary.connectivityDistribution.unknown}
            symbol="?"
          />
        </dl>
      </div>
    </DashboardCard>
  );
}

function Connectivity({
  label,
  value,
  symbol,
}: {
  readonly label: string;
  readonly value: number;
  readonly symbol: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <dt className="text-slate-600">
        <span aria-hidden="true">{symbol} </span>
        {label}
      </dt>
      <dd className="mt-1 font-black text-slate-900">{value}</dd>
    </div>
  );
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}
