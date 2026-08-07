'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import type { ApiClient } from '../auth/api-client';
import { readPublicWebConfig } from '../config/public-env';
import {
  getSingleDeviceDiagnostics,
  getSingleDeviceOverview,
  getSingleDeviceRiskProfile,
  listSingleDeviceAuditLog,
  updateSingleDeviceRiskProfile,
} from './single-device-api';
import {
  riskLabel,
  riskReasonLabel,
  type AuditResponse,
  type Diagnostics,
  type Overview,
  type Profile,
  type Threshold,
} from './single-device-contracts';
import { InteractiveChart } from './interactive-chart';

const unavailable = 'Data tidak tersedia';
type RequestClient = Pick<ApiClient, 'request'>;

function formatDate(value: string | null): string {
  return value === null ? unavailable : new Date(value).toLocaleString('id-ID');
}

function ErrorBanner({ message }: { readonly message: string | null }) {
  return message === null ? null : (
    <p role="alert" className="error-banner">
      {message}
    </p>
  );
}

export function OverviewPanel({ client }: { readonly client: RequestClient }) {
  const presentationMode = readPublicWebConfig().presentationMode;
  const [minutes, setMinutes] = useState(() => (presentationMode ? 5 : 24 * 60));
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [presentationView, setPresentationView] = useState(false);

  useEffect(() => {
    const exit = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresentationView(false);
    };
    window.addEventListener('keydown', exit);
    return () => window.removeEventListener('keydown', exit);
  }, []);

  const load = useCallback(async () => {
    const to = new Date();
    const from = new Date(to.getTime() - minutes * 60 * 1000);
    try {
      setLoading(true);
      setData(await getSingleDeviceOverview(client, from.toISOString(), to.toISOString()));
      try {
        setProfile((await getSingleDeviceRiskProfile(client)).data);
      } catch {
        setProfile(null);
      }
      setError(null);
      setLastRefreshedAt(new Date());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Data tidak dapat dimuat');
    } finally {
      setLoading(false);
    }
  }, [client, minutes]);

  useEffect(() => {
    const initialTimeoutId = window.setTimeout(() => void load(), 0);
    const intervalId = window.setInterval(() => void load(), presentationMode ? 5_000 : 30_000);
    return () => {
      window.clearTimeout(initialTimeoutId);
      window.clearInterval(intervalId);
    };
  }, [load, presentationMode]);

  const readings = [
    ['Kemiringan', 'tiltMagnitudeDeg', '°'],
    ['Kelembapan tanah', 'soilMoisturePct', '%'],
    ['Curah hujan', 'rainfallMmHour', 'mm/jam'],
  ] as const;

  return (
    <section
      className={`overview-dashboard space-y-4 ${presentationView ? 'presentation-view' : ''}`}
    >
      <div className="presentation-toolbar" aria-hidden={!presentationView}>
        <strong>SiagaLongsor</strong>
        <span>{presentationMode ? '● LIVE DEMO' : '● PEMANTAUAN'}</span>
        <span>
          {lastRefreshedAt === null
            ? 'Belum diperbarui'
            : `Diperbarui ${lastRefreshedAt.toLocaleTimeString('id-ID')}`}
        </span>
        <button type="button" onClick={() => setPresentationView(false)}>
          Keluar
        </button>
      </div>
      {presentationMode && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950">
          Mode Demonstrasi — data dapat berasal dari simulator untuk keperluan presentasi.
        </p>
      )}
      <div className="overview-toolbar flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="sr-only" htmlFor="overview-range">
          Rentang histori
        </label>
        <select
          id="overview-range"
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value))}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value={5}>5 menit</option>
          <option value={15}>15 menit</option>
          <option value={60}>1 jam</option>
          <option value={360}>6 jam</option>
          <option value={1440}>24 jam</option>
          <option value={4320}>72 jam</option>
          <option value={10080}>7 hari</option>
        </select>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white"
        >
          {loading ? 'Memuat…' : 'Muat ulang'}
        </button>
        <button
          type="button"
          onClick={() => setPresentationView(true)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800"
        >
          Mode Presentasi
        </button>
        <p className="ml-auto text-xs text-slate-500" aria-live="polite">
          {lastRefreshedAt === null
            ? 'Belum diperbarui'
            : `Diperbarui ${lastRefreshedAt.toLocaleTimeString('id-ID')}`}{' '}
          · Otomatis setiap {presentationMode ? '5 detik' : '30 detik'}
        </p>
      </div>
      <ErrorBanner message={error} />
      {data !== null && (
        <>
          <div
            className={`risk-status-panel rounded-2xl border p-4 shadow-sm ${riskStatusClass(data.data.risk.status)}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[.12em]">STATUS RISIKO OTORITATIF</p>
                <strong className="mt-1 block text-3xl tracking-tight">
                  {riskLabel[data.data.risk.status]}
                </strong>
              </div>
              <span className="rounded-full border border-current px-3 py-1 text-xs font-black tracking-wider">
                {data.data.risk.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-700">
              {data.data.risk.reasons.map(riskReasonLabel).join(', ') ||
                'Tidak ada alasan tersedia'}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Observasi: {formatDate(data.data.risk.observedAt)} · {data.data.risk.freshness}
            </p>
            {!data.data.configured && (
              <p className="mt-2 text-sm font-semibold text-amber-700">
                Perangkat belum dikonfigurasi.
              </p>
            )}
          </div>
          <div className="overview-kpis grid gap-3 md:grid-cols-3">
            {readings.map(([label, key, unit]) => {
              const value = data.data.readings[key];
              return (
                <CurrentSensorCard
                  key={key}
                  title={label}
                  unit={unit}
                  value={value}
                  values={data.data.series[key]}
                />
              );
            })}
          </div>
          <p className="text-xs text-slate-500">
            Celah grafik menunjukkan pembacaan sensor tidak tersedia.
          </p>
          <div className="overview-chart-grid grid gap-4">
            {readings.map(([label, key, unit]) => (
              <InteractiveChart
                key={key}
                title={label}
                unit={unit}
                values={data.data.series[key]}
                thresholds={profile?.[key]}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function CurrentSensorCard({
  title,
  unit,
  value,
  values,
}: {
  readonly title: string;
  readonly unit: string;
  readonly value: number | null;
  readonly values: readonly { readonly value: number | null }[];
}) {
  const valid = values.flatMap((item) => (item.value === null ? [] : [item.value]));
  const previous = valid.length > 1 ? (valid.at(-2) ?? null) : null;
  const delta = value === null || previous === null ? null : value - previous;
  return (
    <article
      className={`kpi-card kpi-${title === 'Kemiringan' ? 'tilt' : title === 'Kelembapan tanah' ? 'soil' : 'rain'} rounded-2xl border border-slate-200 bg-white p-4 shadow-sm`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">
        {value === null ? (
          '—'
        ) : (
          <>
            {value} <span className="text-base font-semibold text-slate-500">{unit}</span>
          </>
        )}
      </p>
      <p className="mt-2 text-xs font-semibold text-slate-500">
        {delta === null ? (
          'Belum cukup data'
        ) : (
          <span className={delta >= 0 ? 'text-sky-700' : 'text-emerald-700'}>
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toLocaleString('id-ID')} {unit}
          </span>
        )}
      </p>
    </article>
  );
}

function riskStatusClass(status: Overview['data']['risk']['status']): string {
  return {
    SAFE: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    WATCH: 'border-amber-200 bg-amber-50 text-amber-950',
    DANGER: 'border-red-300 bg-red-50 text-red-950',
    UNKNOWN: 'border-slate-400 bg-slate-100 text-slate-950',
  }[status];
}

export function DevicePanel({ client }: { readonly client: RequestClient }) {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await getSingleDeviceDiagnostics(client));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Data perangkat tidak dapat dimuat');
    }
  }, [client]);
  useEffect(() => {
    const initialTimeoutId = window.setTimeout(() => void load(), 0);
    const intervalId = window.setInterval(() => void load(), 30_000);
    return () => {
      window.clearTimeout(initialTimeoutId);
      window.clearInterval(intervalId);
    };
  }, [load]);

  const health = {
    READABLE: 'Terbaca',
    UNREADABLE: 'Tidak terbaca',
    UNKNOWN: 'Tidak diketahui',
  } as const;
  if (data === null) return <ErrorBanner message={error ?? 'Memuat data perangkat…'} />;
  const device = data.data;
  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => void load()}
        className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white"
      >
        Muat ulang
      </button>
      <ErrorBanner message={error} />
      {!device.configured && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Perangkat belum dikonfigurasi.
        </p>
      )}
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold tracking-[.12em] text-slate-500">STATUS PERANGKAT</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">
              {device.displayName ?? unavailable}
            </h2>
            <p className="mt-1 font-mono text-sm text-slate-500">
              {device.hardwareId ?? unavailable}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black ${device.connectivity === 'ONLINE' ? 'bg-emerald-100 text-emerald-800' : device.connectivity === 'OFFLINE' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}
          >
            {device.connectivity}
          </span>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Firmware:{' '}
          <span className="font-mono text-slate-900">{device.firmwareVersion ?? unavailable}</span>
        </p>
      </article>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-950">Konektivitas</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <DeviceField label="Terakhir terlihat" value={formatDate(device.lastSeenAt)} />
            <DeviceField label="Telemetri terakhir" value={formatDate(device.lastTelemetryAt)} />
            <DeviceField label="Jaringan" value={device.network?.type ?? unavailable} />
            <DeviceField
              label="Sinyal RSSI"
              value={
                device.network?.signalRssi === null || device.network === null
                  ? unavailable
                  : `${device.network.signalRssi} dBm`
              }
            />
          </dl>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-950">Daya</h2>
          <p className="mt-4 text-2xl font-bold tabular-nums text-slate-950">
            {device.batteryVoltage === null ? '—' : `${device.batteryVoltage} V`}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {device.batteryVoltage === null
              ? 'Pengukuran baterai belum tersedia'
              : 'Diagnostik perangkat'}
          </p>
        </article>
      </div>
      <section>
        <h2 className="mb-3 font-bold text-slate-950">Kesehatan sensor</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <SensorHealthCard title="Kemiringan" status={health[device.sensors.tilt]} />
          <SensorHealthCard title="Kelembapan Tanah" status={health[device.sensors.soilMoisture]} />
          <SensorHealthCard title="Curah Hujan" status={health[device.sensors.rainfall]} />
        </div>
      </section>
    </section>
  );
}

function DeviceField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
function SensorHealthCard({ title, status }: { readonly title: string; readonly status: string }) {
  const tone =
    status === 'Terbaca'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : status === 'Tidak terbaca'
        ? 'border-red-200 bg-red-50 text-red-900'
        : 'border-slate-200 bg-slate-50 text-slate-800';
  return (
    <article className={`rounded-2xl border p-4 ${tone}`}>
      <p className="font-bold">{title}</p>
      <p className="mt-2 text-sm font-semibold">{status}</p>
    </article>
  );
}

export function ProfilePanel({ client }: { readonly client: RequestClient }) {
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData((await getSingleDeviceRiskProfile(client)).data);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Profil risiko tidak dapat dimuat');
    }
  }, [client]);
  useEffect(() => {
    const initialTimeoutId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialTimeoutId);
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (data === null) return;
    const form = new FormData(event.currentTarget);
    const body = {
      tiltMagnitudeDeg: threshold(form, 'tilt'),
      soilMoisturePct: threshold(form, 'soil'),
      rainfallMmHour: threshold(form, 'rain'),
      calibrationStatus: data.calibrationStatus,
      notes: String(form.get('notes') ?? '').trim() === '' ? null : String(form.get('notes')),
    };
    if (!validThresholds([body.tiltMagnitudeDeg, body.soilMoisturePct, body.rainfallMmHour])) {
      setMessage('WATCH harus lebih rendah dari DANGER dan keduanya harus berupa angka terbatas.');
      return;
    }
    try {
      const response = await updateSingleDeviceRiskProfile(client, body);
      setMessage(
        response.data.changed
          ? `Profil versi ${response.data.profile.version} aktif.`
          : 'Tidak ada perubahan pada profil aktif.',
      );
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Profil risiko tidak dapat disimpan.');
    }
  }

  if (data === null) return <ErrorBanner message={error ?? 'Memuat profil risiko…'} />;
  const fields = [
    ['Kemiringan', 'tilt', data.tiltMagnitudeDeg],
    ['Kelembapan tanah', 'soil', data.soilMoisturePct],
    ['Curah hujan', 'rain', data.rainfallMmHour],
  ] as const;
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
    >
      <p className="text-sm text-slate-700">
        Versi {data.version} · {data.calibrationStatus} · {formatDate(data.activatedAt)}
      </p>
      {fields.map(([label, key, thresholds]) => (
        <fieldset key={key} className="grid gap-2">
          <legend className="font-semibold text-slate-900">{label}</legend>
          <label className="text-sm">
            WATCH{' '}
            <input
              aria-label={`${label} WATCH`}
              name={`${key}-watch`}
              defaultValue={thresholds.watch}
              type="number"
              step="any"
              className="ml-2 rounded border p-2"
            />
          </label>
          <label className="text-sm">
            DANGER{' '}
            <input
              aria-label={`${label} DANGER`}
              name={`${key}-danger`}
              defaultValue={thresholds.danger}
              type="number"
              step="any"
              className="ml-2 rounded border p-2"
            />
          </label>
        </fieldset>
      ))}
      <label className="grid gap-1 text-sm">
        Catatan
        <textarea name="notes" defaultValue={data.notes ?? ''} className="rounded border p-2" />
      </label>
      <p className="text-sm text-slate-600">
        Threshold harus mengikuti keputusan kalibrasi lapangan yang tervalidasi.
      </p>
      <button className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white">
        Simpan
      </button>
      {message !== null && <p role="status">{message}</p>}
      <ErrorBanner message={error} />
    </form>
  );
}

function threshold(form: FormData, key: string): Threshold {
  return { watch: Number(form.get(`${key}-watch`)), danger: Number(form.get(`${key}-danger`)) };
}

function validThresholds(thresholds: readonly Threshold[]): boolean {
  return thresholds.every(
    ({ watch, danger }) => Number.isFinite(watch) && Number.isFinite(danger) && watch < danger,
  );
}

export function AuditPanel({ client }: { readonly client: RequestClient }) {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    async (cursor?: string) => {
      try {
        const response = await listSingleDeviceAuditLog(client, cursor);
        setData((previous) =>
          previous !== null && cursor !== undefined
            ? {
                data: [
                  ...previous.data,
                  ...response.data.filter(
                    (entry) => !previous.data.some((existing) => existing.id === entry.id),
                  ),
                ],
                page: response.page,
              }
            : response,
        );
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Audit tidak dapat dimuat');
      }
    },
    [client],
  );
  useEffect(() => {
    const initialTimeoutId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialTimeoutId);
  }, [load]);
  return (
    <section className="space-y-4">
      <ErrorBanner message={error} />
      {data?.data.length === 0 && <p>Belum ada perubahan status risiko.</p>}
      <div className="border-l-2 border-slate-200 pl-5">
        {data?.data.map((entry) => (
          <article
            key={entry.id}
            className={`relative mb-4 rounded-2xl border bg-white p-5 shadow-sm ${auditTone(entry.currentStatus)}`}
          >
            <span
              aria-hidden="true"
              className="absolute -left-[1.85rem] top-6 size-3 rounded-full border-2 border-white bg-current"
            />
            <p className="text-xs font-semibold text-slate-500">{formatDate(entry.occurredAt)}</p>
            <strong className="text-slate-950">
              {riskLabel[entry.previousStatus]} → {riskLabel[entry.currentStatus]}
            </strong>
            <p className="mt-2 text-sm font-medium">
              {formatDate(entry.occurredAt)} · {entry.reasons.map(riskReasonLabel).join(', ')}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Tilt {entry.sensorSnapshot.tiltMagnitudeDeg ?? unavailable}, tanah{' '}
              {entry.sensorSnapshot.soilMoisturePct ?? unavailable}, hujan{' '}
              {entry.sensorSnapshot.rainfallMmHour ?? unavailable}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Profil risiko v{entry.riskProfile.version ?? unavailable}
            </p>
          </article>
        ))}
      </div>
      {data?.page.hasMore && data.page.nextCursor !== null && (
        <button
          type="button"
          onClick={() => void load(data.page.nextCursor ?? undefined)}
          className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white"
        >
          Muat berikutnya
        </button>
      )}
    </section>
  );
}

function auditTone(status: Overview['data']['risk']['status']): string {
  return {
    SAFE: 'border-emerald-200 text-emerald-700',
    WATCH: 'border-amber-200 text-amber-700',
    DANGER: 'border-red-200 text-red-700',
    UNKNOWN: 'border-slate-300 text-slate-700',
  }[status];
}

export function ProjectOwnerRequired() {
  return (
    <div role="alert" className="error-banner">
      Halaman ini memerlukan akses Project Owner.
    </div>
  );
}
