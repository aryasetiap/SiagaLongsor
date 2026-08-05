'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import type { ApiClient } from '../auth/api-client';
import {
  getSingleDeviceDiagnostics,
  getSingleDeviceOverview,
  getSingleDeviceRiskProfile,
  listSingleDeviceAuditLog,
  updateSingleDeviceRiskProfile,
} from './single-device-api';
import {
  chartSegments,
  riskLabel,
  riskReasonLabel,
  type AuditResponse,
  type Diagnostics,
  type Overview,
  type Profile,
  type Threshold,
} from './single-device-contracts';

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
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const to = new Date();
    const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
    try {
      setData(await getSingleDeviceOverview(client, from.toISOString(), to.toISOString()));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Data tidak dapat dimuat');
    }
  }, [client, hours]);

  useEffect(() => {
    const initialTimeoutId = window.setTimeout(() => void load(), 0);
    const intervalId = window.setInterval(() => void load(), 30_000);
    return () => {
      window.clearTimeout(initialTimeoutId);
      window.clearInterval(intervalId);
    };
  }, [load]);

  const readings = [
    ['Kemiringan', 'tiltMagnitudeDeg', '°'],
    ['Kelembapan tanah', 'soilMoisturePct', '%'],
    ['Curah hujan', 'rainfallMmHour', 'mm/jam'],
  ] as const;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="overview-range">
          Rentang histori
        </label>
        <select
          id="overview-range"
          value={hours}
          onChange={(event) => setHours(Number(event.target.value))}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value={24}>24 jam</option>
          <option value={72}>72 jam</option>
          <option value={168}>7 hari</option>
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white"
        >
          Muat ulang
        </button>
      </div>
      <ErrorBanner message={error} />
      {data !== null && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-600">Status risiko</p>
            <strong className="text-2xl text-slate-950">{riskLabel[data.data.risk.status]}</strong>
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
          <div className="grid gap-3 md:grid-cols-3">
            {readings.map(([label, key]) => (
              <Chart key={key} title={label} values={data.data.series[key]} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Chart({
  title,
  values,
}: {
  readonly title: string;
  readonly values: Overview['data']['series']['tiltMagnitudeDeg'];
}) {
  const segments = chartSegments(values);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="font-bold text-slate-950">{title}</h2>
      {values.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">Belum ada histori.</p>
      ) : (
        <svg
          viewBox="0 0 200 80"
          className="mt-3 h-28 w-full text-blue-700"
          aria-label={`Grafik ${title}`}
        >
          {segments.map((segment, segmentIndex) => (
            <polyline
              key={segmentIndex}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              points={segment
                .map(
                  (value, pointIndex) =>
                    `${(pointIndex / Math.max(segment.length - 1, 1)) * 190 + 5},${75 - Math.min(70, value)}`,
                )
                .join(' ')}
            />
          ))}
        </svg>
      )}
      <p className="mt-2 text-xs text-slate-500">Celah data ditampilkan tanpa garis penghubung.</p>
    </div>
  );
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
