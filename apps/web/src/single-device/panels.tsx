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
  const [minutes, setMinutes] = useState(24 * 60);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const to = new Date();
    const from = new Date(to.getTime() - minutes * 60 * 1000);
    try {
      setLoading(true);
      setData(await getSingleDeviceOverview(client, from.toISOString(), to.toISOString()));
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
    <section className="space-y-5">
      {presentationMode && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950">
          Mode Demonstrasi — data dapat berasal dari simulator untuk keperluan presentasi.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
            className={`rounded-3xl border p-6 shadow-sm ${riskStatusClass(data.data.risk.status)}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Status risiko otoritatif</p>
                <strong className="mt-1 block text-3xl">{riskLabel[data.data.risk.status]}</strong>
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
          <div className="grid gap-3 md:grid-cols-3">
            {readings.map(([label, key, unit]) => {
              const value = data.data.readings[key];
              return (
                <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm text-slate-600">{label}</p>
                  <strong className="mt-1 block text-lg text-slate-950">
                    {value === null ? unavailable : `${value} ${unit}`}
                  </strong>
                </div>
              );
            })}
          </div>
          <div className="space-y-4">
            {readings.map(([label, key, unit]) => (
              <InteractiveChart
                key={key}
                title={label}
                unit={unit}
                values={data.data.series[key]}
              />
            ))}
          </div>
        </>
      )}
    </section>
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
  const connection = {
    ONLINE: 'Terhubung',
    DELAYED: 'Terlambat',
    OFFLINE: 'Terputus',
    UNKNOWN: 'Tidak diketahui',
  } as const;
  if (data === null) return <ErrorBanner message={error ?? 'Memuat data perangkat…'} />;
  const device = data.data;
  const fields = {
    Konektivitas: connection[device.connectivity],
    Hardware: device.hardwareId,
    'Nama perangkat': device.displayName,
    Firmware: device.firmwareVersion,
    'Terakhir terlihat': formatDate(device.lastSeenAt),
    'Telemetri terakhir': formatDate(device.lastTelemetryAt),
    Jaringan: device.network?.type ?? null,
    'Sinyal RSSI':
      device.network?.signalRssi === null || device.network === null
        ? null
        : `${device.network.signalRssi} dBm`,
    Baterai: device.batteryVoltage === null ? null : `${device.batteryVoltage} V`,
    Tilt: health[device.sensors.tilt],
    'Kelembapan tanah': health[device.sensors.soilMoisture],
    'Curah hujan': health[device.sensors.rainfall],
  };
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
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(fields).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-600">{label}</p>
            <strong className="mt-1 block text-slate-950">{value ?? unavailable}</strong>
          </div>
        ))}
      </div>
    </section>
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
    <section className="space-y-3">
      <ErrorBanner message={error} />
      {data?.data.length === 0 && <p>Belum ada perubahan status risiko.</p>}
      {data?.data.map((entry) => (
        <article key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <strong className="text-slate-950">
            {riskLabel[entry.previousStatus]} → {riskLabel[entry.currentStatus]}
          </strong>
          <p className="mt-1 text-sm">
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

export function ProjectOwnerRequired() {
  return (
    <div role="alert" className="error-banner">
      Halaman ini memerlukan akses Project Owner.
    </div>
  );
}
