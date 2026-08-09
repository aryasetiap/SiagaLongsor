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
const overviewRanges = [
  [5, '5m', '5 menit'],
  [15, '15m', '15 menit'],
  [60, '1j', '1 jam'],
  [360, '6j', '6 jam'],
  [1440, '24j', '24 jam'],
  [4320, '72j', '72 jam'],
  [10080, '7h', '7 hari'],
] as const;

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
      <div className="overview-toolbar">
        {presentationMode && (
          <p className="demo-notice">
            <span className="sr-only">Mode Demonstrasi. </span>
            <span className="demo-notice-label">● LIVE DEMO</span>
            <span>Data dapat berasal dari simulator</span>
          </p>
        )}
        <div className="range-pills" role="group" aria-label="Pilihan rentang waktu">
          {overviewRanges.map(([value, shortLabel, label]) => (
            <button
              key={value}
              type="button"
              className={minutes === value ? 'active' : ''}
              aria-pressed={minutes === value}
              aria-label={label}
              onClick={() => setMinutes(value)}
            >
              {shortLabel}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="overview-range">
          Rentang histori
        </label>
        <select
          id="overview-range"
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value))}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {overviewRanges.map(([value, , label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
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
          <div className="overview-bento">
            <div
              className={`risk-status-panel risk-hero risk-${data.data.risk.status.toLowerCase()}`}
            >
              <div className="risk-hero-top">
                <div>
                  <p className="risk-hero-eyebrow">STATUS RISIKO OTORITATIF</p>
                  <strong className="risk-hero-label">{riskLabel[data.data.risk.status]}</strong>
                </div>
                <span className="risk-status-code">
                  <span aria-hidden="true" className="risk-status-dot" />
                  {data.data.risk.status}
                </span>
              </div>
              <p className="risk-hero-reason">
                {data.data.risk.reasons.map(riskReasonLabel).join(', ') ||
                  'Tidak ada alasan tersedia'}
              </p>
              <div className="risk-hero-meta">
                <span>
                  <span className="risk-online-dot" aria-hidden="true" /> {data.data.risk.freshness}
                </span>
                <span>Observasi {formatDate(data.data.risk.observedAt)}</span>
                {!data.data.configured && <span>Perangkat belum dikonfigurasi</span>}
              </div>
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
          </div>
          <div className="history-heading">
            <div>
              <h2>Riwayat Sensor</h2>
              <p>Perubahan pembacaan pada rentang waktu yang dipilih.</p>
            </div>
            <p className="history-gap-hint">Celah grafik menunjukkan data sensor tidak tersedia.</p>
          </div>
          <div className="overview-chart-grid grid gap-4">
            {readings.map(([label, key, unit]) => (
              <InteractiveChart
                key={key}
                title={label}
                unit={unit}
                values={data.data.series[key]}
                thresholds={data.data.thresholds?.[key]}
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
      className={`kpi-card kpi-${title === 'Kemiringan' ? 'tilt' : title === 'Kelembapan tanah' ? 'soil' : 'rain'}`}
    >
      <div className="kpi-card-heading">
        <span className="kpi-icon" aria-hidden="true">
          <SensorIcon title={title} />
        </span>
        <p>{title}</p>
      </div>
      <p className="kpi-value">
        {value === null ? (
          '—'
        ) : (
          <>
            {value} <span className="text-base font-semibold text-slate-500">{unit}</span>
          </>
        )}
      </p>
      <p className="kpi-delta">
        {delta === null ? (
          'Belum cukup data'
        ) : (
          <span className={delta === 0 ? 'neutral' : delta > 0 ? 'positive' : 'negative'}>
            {delta === 0 ? '→' : delta > 0 ? '↑' : '↓'} {Math.abs(delta).toLocaleString('id-ID')}{' '}
            {unit}
          </span>
        )}
      </p>
    </article>
  );
}

function SensorIcon({ title }: { readonly title: string }) {
  const path =
    title === 'Kemiringan'
      ? 'M5 17 10 7l4 8 5-4M5 19h14'
      : title === 'Kelembapan tanah'
        ? 'M12 3s5 5.2 5 9a5 5 0 0 1-10 0c0-3.8 5-9 5-9Zm-2 10c.4 1.1 1.1 1.8 2.4 2.1'
        : 'M4 15a5 5 0 0 1 1-9 6 6 0 0 1 11 2 4 4 0 1 1 1 7H4Zm5 3 1-2m4 2 1-2';
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
  if (data === null) return <ErrorBanner message={error ?? 'Memuat data perangkat…'} />;
  const device = data.data;
  return (
    <section className="device-dashboard">
      <div className="panel-action-row">
        <button
          type="button"
          onClick={() => void load()}
          className="dashboard-button dashboard-button-dark"
        >
          Muat ulang
        </button>
      </div>
      <ErrorBanner message={error} />
      {!device.configured && <p className="device-config-notice">Perangkat belum dikonfigurasi.</p>}
      <article className="device-hero">
        <p className="device-hero-eyebrow">STATUS PERANGKAT</p>
        <div className="device-hero-top">
          <div>
            <h2>{device.displayName ?? unavailable}</h2>
            <p className="device-hardware-id">{device.hardwareId ?? unavailable}</p>
          </div>
          <span className={`device-status-pill connectivity-${device.connectivity.toLowerCase()}`}>
            <span aria-hidden="true" />
            {device.connectivity}
          </span>
        </div>
        <p className="device-firmware">
          Firmware <span>{device.firmwareVersion ?? unavailable}</span>
        </p>
      </article>
      <div className="device-diagnostics-grid">
        <article className="diagnostic-card diagnostic-connectivity">
          <h2>Konektivitas</h2>
          <dl className="device-field-grid">
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
        <article className="diagnostic-card diagnostic-power">
          <h2>Daya</h2>
          <p className="device-power-value">
            {device.batteryVoltage === null ? '—' : `${device.batteryVoltage} V`}
          </p>
          <p className="device-power-detail">
            {device.batteryVoltage === null
              ? 'Pengukuran baterai belum tersedia'
              : 'Diagnostik perangkat'}
          </p>
        </article>
      </div>
      <section className="sensor-health-section">
        <div className="section-heading">
          <h2>Kesehatan sensor</h2>
          <p>Status keterbacaan pembacaan sensor terakhir.</p>
        </div>
        <div className="sensor-health-grid">
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
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function SensorHealthCard({ title, status }: { readonly title: string; readonly status: string }) {
  const category = title === 'Kemiringan' ? 'tilt' : title === 'Kelembapan Tanah' ? 'soil' : 'rain';
  return (
    <article className={`sensor-health-card sensor-health-${category}`}>
      <p>{title}</p>
      <strong>{status}</strong>
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
      rainfallDuration: {
        moderateDailyMinMm: Number(form.get('rain-duration-min')),
        moderateDailyMaxMm: Number(form.get('rain-duration-max')),
        consecutiveDays: Number(form.get('rain-duration-days')),
        continuationRainfallMmHourGt: Number(form.get('rain-duration-continuation')),
      },
      calibrationStatus: data.calibrationStatus,
      notes: String(form.get('notes') ?? '').trim() === '' ? null : String(form.get('notes')),
    };
    if (!validThresholds([body.tiltMagnitudeDeg, body.soilMoisturePct, body.rainfallMmHour])) {
      setMessage('WATCH harus lebih rendah dari DANGER dan keduanya harus berupa angka terbatas.');
      return;
    }
    if (
      !Number.isFinite(body.rainfallDuration.moderateDailyMinMm) ||
      !Number.isFinite(body.rainfallDuration.moderateDailyMaxMm) ||
      body.rainfallDuration.moderateDailyMinMm < 0 ||
      body.rainfallDuration.moderateDailyMinMm >= body.rainfallDuration.moderateDailyMaxMm ||
      !Number.isInteger(body.rainfallDuration.consecutiveDays) ||
      body.rainfallDuration.consecutiveDays < 1 ||
      body.rainfallDuration.consecutiveDays > 30 ||
      !Number.isFinite(body.rainfallDuration.continuationRainfallMmHourGt) ||
      body.rainfallDuration.continuationRainfallMmHourGt < 0
    ) {
      setMessage('Rule durasi hujan harus memiliki rentang dan jumlah hari yang valid.');
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
    ['Kemiringan', 'tilt', '°', data.tiltMagnitudeDeg],
    ['Kelembapan tanah', 'soil', '%', data.soilMoisturePct],
    ['Curah hujan', 'rain', 'mm/jam', data.rainfallMmHour],
  ] as const;
  return (
    <form onSubmit={(event) => void submit(event)} className="profile-form">
      <section className="profile-summary">
        <div>
          <p>Profil aktif</p>
          <strong>Versi {data.version}</strong>
        </div>
        <div>
          <p>Status kalibrasi</p>
          <strong className="profile-calibration-status">{data.calibrationStatus}</strong>
        </div>
        <div>
          <p>Diaktifkan</p>
          <strong>{formatDate(data.activatedAt)}</strong>
        </div>
      </section>
      <div className="threshold-card-grid">
        {fields.map(([label, key, unit, thresholds]) => (
          <fieldset key={key} className={`threshold-card threshold-${key}`}>
            <legend>{label}</legend>
            <p>Ambang evaluasi sensor.</p>
            <label>
              <span>WATCH</span>
              <span className="threshold-input">
                <input
                  aria-label={`${label} WATCH`}
                  name={`${key}-watch`}
                  defaultValue={thresholds.watch}
                  type="number"
                  step="any"
                />
                <span aria-hidden="true">{unit}</span>
              </span>
            </label>
            <label>
              <span>DANGER</span>
              <span className="threshold-input">
                <input
                  aria-label={`${label} DANGER`}
                  name={`${key}-danger`}
                  defaultValue={thresholds.danger}
                  type="number"
                  step="any"
                />
                <span aria-hidden="true">{unit}</span>
              </span>
            </label>
          </fieldset>
        ))}
      </div>
      <fieldset className="threshold-card threshold-rain-duration">
        <legend>Durasi curah hujan</legend>
        <p>
          Jika hujan harian berada dalam rentang ini selama beberapa hari, hujan berikutnya memicu
          DANGER.
        </p>
        <label>
          <span>Minimum hujan sedang</span>
          <span className="threshold-input">
            <input
              name="rain-duration-min"
              defaultValue={data.rainfallDuration.moderateDailyMinMm}
              type="number"
              step="any"
            />
            <span aria-hidden="true">mm/hari</span>
          </span>
        </label>
        <label>
          <span>Maksimum hujan sedang</span>
          <span className="threshold-input">
            <input
              name="rain-duration-max"
              defaultValue={data.rainfallDuration.moderateDailyMaxMm}
              type="number"
              step="any"
            />
            <span aria-hidden="true">mm/hari</span>
          </span>
        </label>
        <label>
          <span>Hari berturut-turut</span>
          <span className="threshold-input">
            <input
              name="rain-duration-days"
              defaultValue={data.rainfallDuration.consecutiveDays}
              type="number"
              min="1"
              max="30"
              step="1"
            />
            <span aria-hidden="true">hari</span>
          </span>
        </label>
        <label>
          <span>Hujan lanjutan</span>
          <span className="threshold-input">
            <input
              name="rain-duration-continuation"
              defaultValue={data.rainfallDuration.continuationRainfallMmHourGt}
              type="number"
              min="0"
              step="any"
            />
            <span aria-hidden="true">mm/jam</span>
          </span>
        </label>
      </fieldset>
      <label className="profile-notes">
        Catatan
        <textarea name="notes" defaultValue={data.notes ?? ''} />
      </label>
      <p className="profile-calibration-note">
        Threshold harus mengikuti keputusan kalibrasi lapangan yang tervalidasi.
      </p>
      <div className="profile-form-footer">
        <button className="dashboard-button dashboard-button-dark">Simpan</button>
        {message !== null && <p role="status">{message}</p>}
      </div>
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
    <section className="audit-feed">
      <ErrorBanner message={error} />
      {data?.data.length === 0 && <p className="audit-empty">Belum ada perubahan status risiko.</p>}
      <div className="audit-timeline">
        {data?.data.map((entry) => (
          <article
            key={entry.id}
            className={`audit-timeline-item ${auditTone(entry.currentStatus)}`}
          >
            <span aria-hidden="true" className="audit-timeline-dot" />
            <p className="audit-timestamp">{formatDate(entry.occurredAt)}</p>
            <strong className="audit-transition">
              {riskLabel[entry.previousStatus]} → {riskLabel[entry.currentStatus]}
            </strong>
            <span className="audit-status-code">{entry.currentStatus}</span>
            <p className="audit-reasons">{entry.reasons.map(riskReasonLabel).join(', ')}</p>
            <p className="audit-snapshot">
              Tilt {entry.sensorSnapshot.tiltMagnitudeDeg ?? unavailable}, tanah{' '}
              {entry.sensorSnapshot.soilMoisturePct ?? unavailable}, hujan{' '}
              {entry.sensorSnapshot.rainfallMmHour ?? unavailable}
            </p>
            <p className="audit-profile">
              Profil risiko v{entry.riskProfile.version ?? unavailable}
            </p>
          </article>
        ))}
      </div>
      {data?.page.hasMore && data.page.nextCursor !== null && (
        <button
          type="button"
          onClick={() => void load(data.page.nextCursor ?? undefined)}
          className="dashboard-button dashboard-button-dark"
        >
          Muat berikutnya
        </button>
      )}
    </section>
  );
}

function auditTone(status: Overview['data']['risk']['status']): string {
  return {
    SAFE: 'audit-safe',
    WATCH: 'audit-watch',
    DANGER: 'audit-danger',
    UNKNOWN: 'audit-unknown',
  }[status];
}

export function ProjectOwnerRequired() {
  return (
    <div role="alert" className="error-banner">
      Halaman ini memerlukan akses Project Owner.
    </div>
  );
}
