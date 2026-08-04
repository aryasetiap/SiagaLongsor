'use client';

import { type FormEvent, type ReactNode, useEffect, useState } from 'react';

import type { DataEnvelope, ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import type { MonitoringPoint } from '../monitoring-points/monitoring-point-contracts';
import { listMonitoringPoints } from '../monitoring-points/monitoring-points-api';
import { useOptionalRealtime } from '../realtime/realtime-context';
import type { Site } from '../sites/site-contracts';
import { listSites } from '../sites/sites-api';
import { AlertEventHistory } from './alert-event-history';
import { AlertOperationDialog, type AlertOperation } from './alert-operation-dialog';
import { SopQuickAccess } from '../map/sop-quick-access';
import { getAlert, listAlerts } from './risk-api';
import type {
  Alert,
  AlertListQuery,
  AlertSeverity,
  AlertSort,
  AlertStatus,
  AlertType,
} from './risk-contracts';
import {
  alertStatusLabel,
  alertTypeLabel,
  formatSiteTimestamp,
  reasonLabel,
  severityLabel,
} from './risk-presentation';

interface Props {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly role?: 'PROJECT_OWNER' | 'SCHOOL_ADMIN';
}

const initialFilters: AlertListQuery = { sort: 'lastObservedAt:desc' };

export function AlertsManager({ client, organizationId, role }: Props) {
  const realtime = useOptionalRealtime();
  const [siteId, setSiteId] = useState('');
  const [pointId, setPointId] = useState('');
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<AlertSort>('lastObservedAt:desc');
  const [filters, setFilters] = useState<AlertListQuery>(initialFilters);
  const [result, setResult] = useState<ListEnvelope<Alert> | null>(null);
  const [sites, setSites] = useState<readonly Site[]>([]);
  const [points, setPoints] = useState<readonly MonitoringPoint[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<DataEnvelope<Alert> | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [detailError, setDetailError] = useState<Error | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const key = JSON.stringify([organizationId, filters, retry, realtime.generations.alerts]);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const current = key === resultKey ? result : null;

  useEffect(() => {
    let active = true;
    void listAlerts(client, organizationId, { ...filters, limit: 25 })
      .then((response) => {
        if (active) {
          setResult(response);
          setError(null);
          setResultKey(key);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason : new Error('Peringatan gagal dimuat.'));
          setResultKey(key);
        }
      });
    return () => {
      active = false;
    };
  }, [client, filters, key, organizationId]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      listSites(client, organizationId, { limit: 100, sort: 'name:asc' }),
      listMonitoringPoints(client, organizationId, { limit: 100, sort: 'name:asc' }),
    ])
      .then(([sitePage, pointPage]) => {
        if (active) {
          setSites(sitePage.data);
          setPoints(pointPage.data);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, organizationId]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({
      ...(siteId === '' ? {} : { siteId }),
      ...(pointId === '' ? {} : { monitoringPointId: pointId }),
      ...(type === '' ? {} : { type: type as AlertType }),
      ...(severity === '' ? {} : { severity: severity as AlertSeverity }),
      ...(status === '' ? {} : { status: status as AlertStatus }),
      sort,
    });
  }

  function reset() {
    setSiteId('');
    setPointId('');
    setType('');
    setSeverity('');
    setStatus('');
    setSort('lastObservedAt:desc');
    setFilters(initialFilters);
  }

  function openDetail(alertId: string) {
    setDetailId(alertId);
    setDetail(null);
    setDetailError(null);
  }

  useEffect(() => {
    if (detailId === null) return;
    let active = true;
    void getAlert(client, organizationId, detailId)
      .then((response) => {
        if (active) {
          setDetail(response);
          setDetailError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setDetailError(reason instanceof Error ? reason : new Error('Detail gagal dimuat.'));
      });
    return () => {
      active = false;
    };
  }, [client, detailId, detailRefresh, organizationId, realtime.generations.selectedAlert]);

  async function loadMore() {
    if (current === null || current.page.nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await listAlerts(client, organizationId, {
        ...filters,
        cursor: current.page.nextCursor,
        limit: 25,
      });
      const known = new Set(current.data.map((alert) => alert.id));
      setResult({
        data: [...current.data, ...next.data.filter((alert) => !known.has(alert.id))],
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p>REST adalah sumber data utama. Realtime hanya memicu pembaruan terkoordinasi.</p>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setRetry((value) => value + 1)}
        >
          ↻ Segarkan
        </button>
      </div>
      <form
        onSubmit={apply}
        className="mt-5 grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 lg:grid-cols-6"
      >
        <FilterSelect label="Site" value={siteId} onChange={setSiteId}>
          <option value="">Semua Site</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Titik monitoring" value={pointId} onChange={setPointId}>
          <option value="">Semua titik</option>
          {points.map((point) => (
            <option key={point.id} value={point.id}>
              {point.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Jenis" value={type} onChange={setType}>
          <option value="">Semua jenis</option>
          {(
            [
              'RISK_WATCH',
              'RISK_DANGER',
              'DEVICE_DELAYED',
              'DEVICE_OFFLINE',
              'DEVICE_SERVER_MISMATCH',
            ] as const
          ).map((value) => (
            <option key={value} value={value}>
              {alertTypeLabel(value)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Severity" value={severity} onChange={setSeverity}>
          <option value="">Semua severity</option>
          <option value="INFO">Informasi</option>
          <option value="WARNING">Peringatan</option>
          <option value="CRITICAL">Kritis</option>
        </FilterSelect>
        <FilterSelect label="Status" value={status} onChange={setStatus}>
          <option value="">Semua status</option>
          <option value="ACTIVE">Aktif</option>
          <option value="ACKNOWLEDGED">Diketahui</option>
          <option value="RESOLVED">Selesai</option>
          <option value="FALSE_ALARM">Alarm palsu</option>
        </FilterSelect>
        <FilterSelect
          label="Urutkan"
          value={sort}
          onChange={(value) => setSort(value as AlertSort)}
        >
          <option value="lastObservedAt:desc">Terakhir diamati</option>
          <option value="createdAt:desc">Terbaru dibuat</option>
          <option value="severity:desc">Severity tertinggi</option>
        </FilterSelect>
        <div className="flex gap-2 lg:col-span-6">
          <button type="submit" className="primary-button">
            Terapkan
          </button>
          <button type="button" onClick={reset} className="secondary-button">
            Reset
          </button>
        </div>
      </form>

      {current === null && error === null && (
        <p aria-live="polite" className="mt-5 text-sm text-slate-600">
          Memuat peringatan…
        </p>
      )}
      {error !== null && (
        <div role="alert" className="error-banner mt-5">
          <p>Peringatan tidak dapat dimuat.</p>
          {error instanceof ApiClientError && error.requestId !== undefined && (
            <p className="text-xs">Request ID: {error.requestId}</p>
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
        <p className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          Tidak ada peringatan yang sesuai.
        </p>
      )}
      <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200 bg-white">
        {current !== null && current.data.length > 0 && (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="p-4">Peringatan</th>
                <th className="p-4">Lokasi</th>
                <th className="p-4">Status</th>
                <th className="p-4">Observasi</th>
                <th className="p-4">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {current.data.map((alert) => (
                <tr key={alert.id} className="border-t border-slate-100">
                  <td className="p-4">
                    <p className="font-bold text-slate-950">{alertTypeLabel(alert.type)}</p>
                    <p className="text-xs text-slate-500">
                      {severityLabel(alert.severity)} · {alert.occurrenceCount} kali
                    </p>
                  </td>
                  <td className="p-4">
                    {alert.site.name}
                    <br />
                    <span className="text-xs text-slate-500">{alert.monitoringPoint.name}</span>
                  </td>
                  <td className="p-4 font-semibold">
                    <StatusLabel status={alert.status} />
                  </td>
                  <td className="p-4 text-xs">
                    {formatSiteTimestamp(alert.lastObservedAt, alert.site.timezone)}
                  </td>
                  <td className="p-4">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => openDetail(alert.id)}
                    >
                      Lihat detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
      {(detail !== null || detailError !== null) && (
        <AlertDetail
          result={detail}
          error={detailError}
          client={client}
          organizationId={organizationId}
          role={role}
          refreshGeneration={detailRefresh + realtime.generations.selectedAlert}
          onRefresh={() => {
            setRetry((value) => value + 1);
            setDetailRefresh((value) => value + 1);
          }}
          onClose={() => {
            setDetail(null);
            setDetailId(null);
            setDetailError(null);
          }}
        />
      )}
    </>
  );
}

function AlertDetail({
  result,
  error,
  client,
  organizationId,
  role,
  refreshGeneration,
  onRefresh,
  onClose,
}: {
  readonly result: DataEnvelope<Alert> | null;
  readonly error: Error | null;
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly role: 'PROJECT_OWNER' | 'SCHOOL_ADMIN' | undefined;
  readonly refreshGeneration: number;
  readonly onRefresh: () => void;
  readonly onClose: () => void;
}) {
  const alert = result?.data;
  const [operation, setOperation] = useState<AlertOperation | null>(null);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-detail-title"
        aria-describedby="alert-detail-description"
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="flex justify-between gap-4">
          <div>
            <h2 id="alert-detail-title" className="text-xl font-bold">
              Detail peringatan
            </h2>
            <p id="alert-detail-description" className="mt-1 text-sm text-slate-600">
              Status authoritative dan histori operasi dari server.
            </p>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Tutup
          </button>
        </div>
        {error !== null && (
          <div role="alert" className="error-banner mt-5">
            Detail peringatan tidak dapat dimuat.
          </div>
        )}
        {alert !== undefined && (
          <div className="mt-5 space-y-3">
            <p className="text-lg font-bold">{alertTypeLabel(alert.type)}</p>
            <p>
              <StatusLabel status={alert.status} /> · {severityLabel(alert.severity)}
            </p>
            <p>{alert.reasons.map(reasonLabel).join(' ')}</p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Pertama</dt>
                <dd>{formatSiteTimestamp(alert.firstObservedAt, alert.site.timezone)}</dd>
              </div>
              <div>
                <dt className="font-semibold">Terakhir</dt>
                <dd>{formatSiteTimestamp(alert.lastObservedAt, alert.site.timezone)}</dd>
              </div>
              <div>
                <dt className="font-semibold">Jumlah observasi</dt>
                <dd>{alert.occurrenceCount}</dd>
              </div>
              <div>
                <dt className="font-semibold">Lokasi</dt>
                <dd>
                  {alert.site.name} · {alert.monitoringPoint.name}
                </dd>
              </div>
            </dl>
            {alert.severity === 'CRITICAL' && (
              <SopQuickAccess
                client={client}
                organizationId={organizationId}
                siteId={alert.site.id}
              />
            )}
            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              {alert.status === 'ACTIVE' && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setOperation('acknowledge')}
                >
                  Konfirmasi peringatan
                </button>
              )}
              {role === 'PROJECT_OWNER' && alert.status === 'ACKNOWLEDGED' && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setOperation('resolve')}
                >
                  Selesaikan
                </button>
              )}
              {role === 'PROJECT_OWNER' &&
                (alert.status === 'ACTIVE' || alert.status === 'ACKNOWLEDGED') && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setOperation('false-alarm')}
                  >
                    Tandai alarm palsu
                  </button>
                )}
            </div>
            <AlertEventHistory
              client={client}
              organizationId={organizationId}
              alertId={alert.id}
              refreshGeneration={refreshGeneration}
            />
          </div>
        )}
      </section>
      {alert !== undefined && operation !== null && (
        <AlertOperationDialog
          client={client}
          organizationId={organizationId}
          alert={alert}
          operation={operation}
          onClose={() => setOperation(null)}
          onStale={() => {
            onRefresh();
          }}
          onUnavailable={() => {
            setOperation(null);
            onRefresh();
            onClose();
          }}
          onSuccess={() => {
            setOperation(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

function StatusLabel({ status }: { readonly status: AlertStatus }) {
  const icon = { ACTIVE: '!', ACKNOWLEDGED: '✓', RESOLVED: '●', FALSE_ALARM: '×' }[status];
  return (
    <span>
      <span aria-hidden="true" className="mr-1">
        {icon}
      </span>
      {alertStatusLabel(status)}
    </span>
  );
}

function FilterSelect({
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
