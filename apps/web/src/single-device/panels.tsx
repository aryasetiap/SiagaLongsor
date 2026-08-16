'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

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
  riskLevelLabel,
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
type OverviewRangeMode =
  'quick-5' | 'quick-15' | 'quick-60' | 'quick-360' | 'daily' | 'weekly' | 'monthly';
interface OverviewRange {
  readonly mode: OverviewRangeMode;
  readonly shortLabel: string;
  readonly label: string;
  readonly group: 'quick' | 'period';
  readonly minutes?: number;
}
const overviewRanges: readonly OverviewRange[] = [
  { mode: 'quick-5', minutes: 5, shortLabel: '5m', label: '5 menit', group: 'quick' },
  { mode: 'quick-15', minutes: 15, shortLabel: '15m', label: '15 menit', group: 'quick' },
  { mode: 'quick-60', minutes: 60, shortLabel: '1j', label: '1 jam', group: 'quick' },
  { mode: 'quick-360', minutes: 360, shortLabel: '6j', label: '6 jam', group: 'quick' },
  {
    mode: 'daily',
    shortLabel: 'Harian',
    label: 'Harian — pilih tanggal',
    group: 'period',
  },
  {
    mode: 'weekly',
    shortLabel: 'Mingguan',
    label: 'Mingguan — pilih minggu',
    group: 'period',
  },
  {
    mode: 'monthly',
    shortLabel: 'Bulanan',
    label: 'Bulanan — pilih bulan',
    group: 'period',
  },
] as const;

type OverviewSensorKey = keyof Overview['data']['readings'];
interface OverviewSensorDefinition {
  readonly label: string;
  readonly key: OverviewSensorKey;
  readonly unit: string;
  readonly description: string;
}
const overviewSensors: readonly OverviewSensorDefinition[] = [
  {
    label: 'Kemiringan',
    key: 'tiltMagnitudeDeg',
    unit: '°',
    description: 'Perubahan kemiringan lereng terhadap posisi referensi hasil kalibrasi.',
  },
  {
    label: 'Kelembapan tanah',
    key: 'soilMoisturePct',
    unit: '%',
    description: 'Persentase kelembapan tanah berdasarkan hasil kalibrasi sensor.',
  },
  {
    label: 'Curah hujan',
    key: 'rainfallMmHour',
    unit: 'mm/jam',
    description: 'Intensitas curah hujan yang dihitung dari pulsa tipping bucket.',
  },
] as const;

function resolveOverviewRange({
  mode,
  selectedDay,
  selectedWeek,
  selectedMonth,
  now,
}: {
  readonly mode: OverviewRangeMode;
  readonly selectedDay: string;
  readonly selectedWeek: string;
  readonly selectedMonth: string;
  readonly now: Date;
}): { readonly from: Date; readonly to: Date } {
  const quick = overviewRanges.find((range) => range.mode === mode)?.minutes;
  if (quick !== undefined) return { from: new Date(now.getTime() - quick * 60_000), to: now };

  let from: Date;
  let periodEnd: Date;
  if (mode === 'monthly') {
    from = parseLocalMonth(selectedMonth);
    periodEnd = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  } else if (mode === 'weekly') {
    from = parseLocalWeek(selectedWeek);
    periodEnd = addLocalDays(from, 7);
  } else {
    from = parseLocalDate(selectedDay);
    periodEnd = addLocalDays(from, 1);
  }
  return { from, to: periodEnd < now ? periodEnd : now };
}

function overviewPeriodLabel(
  mode: OverviewRangeMode,
  selectedDay: string,
  selectedWeek: string,
  selectedMonth: string,
): string {
  const quick = overviewRanges.find((range) => range.mode === mode);
  if (quick?.minutes !== undefined) return `${quick.label} terakhir`;
  if (mode === 'monthly') {
    const month = parseLocalMonth(selectedMonth).toLocaleDateString('id-ID', {
      month: 'long',
      year: 'numeric',
    });
    return `Bulanan · ${month}`;
  }
  if (mode === 'weekly') {
    const start = parseLocalWeek(selectedWeek);
    const end = addLocalDays(start, 6);
    return `Mingguan · ${formatCalendarDate(start)} – ${formatCalendarDate(end)}`;
  }
  return `Harian · ${parseLocalDate(selectedDay).toLocaleDateString('id-ID', {
    dateStyle: 'long',
  })}`;
}

function isCurrentOverviewPeriod(
  mode: OverviewRangeMode,
  selectedDay: string,
  selectedWeek: string,
  selectedMonth: string,
): boolean {
  const now = new Date();
  if (mode === 'monthly') return selectedMonth >= localMonthInputValue(now);
  if (mode === 'weekly') return selectedWeek >= localWeekInputValue(now);
  if (mode === 'daily') return selectedDay >= localDateInputValue(now);
  return true;
}

function shiftOverviewPeriod(mode: OverviewRangeMode, value: string, amount: -1 | 1): string {
  if (mode === 'monthly') {
    const month = parseLocalMonth(value);
    return localMonthInputValue(new Date(month.getFullYear(), month.getMonth() + amount, 1));
  }
  if (mode === 'weekly')
    return localWeekInputValue(addLocalDays(parseLocalWeek(value), 7 * amount));
  if (mode === 'daily') return localDateInputValue(addLocalDays(parseLocalDate(value), amount));
  return value;
}

function localDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function localMonthInputValue(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
}

function localWeekInputValue(date: Date): string {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const weekYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${weekYear}-W${padDatePart(week)}`;
}

function parseLocalDate(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function parseLocalMonth(value: string): Date {
  const [year = 0, month = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function parseLocalWeek(value: string): Date {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  const year = Number(match?.[1] ?? 0);
  const week = Number(match?.[2] ?? 1);
  const januaryFourth = new Date(year, 0, 4);
  const weekday = januaryFourth.getDay() || 7;
  januaryFourth.setDate(januaryFourth.getDate() - weekday + 1 + (week - 1) * 7);
  januaryFourth.setHours(0, 0, 0, 0);
  return januaryFourth;
}

function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatCalendarDate(date: Date): string {
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(value: string | null): string {
  return value === null ? unavailable : new Date(value).toLocaleString('id-ID');
}

function calibrationStatusLabel(status: string): string {
  return status === 'PROVISIONAL' ? 'Sementara' : status === 'CALIBRATED' ? 'Terkalibrasi' : status;
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
  const [rangeMode, setRangeMode] = useState<OverviewRangeMode>(() =>
    presentationMode ? 'quick-5' : 'daily',
  );
  const [selectedDay, setSelectedDay] = useState(() => localDateInputValue(new Date()));
  const [selectedWeek, setSelectedWeek] = useState(() => localWeekInputValue(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(() => localMonthInputValue(new Date()));
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [presentationView, setPresentationView] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<OverviewSensorKey | null>(null);

  useEffect(() => {
    const exit = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresentationView(false);
    };
    window.addEventListener('keydown', exit);
    return () => window.removeEventListener('keydown', exit);
  }, []);

  const load = useCallback(async () => {
    const { from, to } = resolveOverviewRange({
      mode: rangeMode,
      selectedDay,
      selectedWeek,
      selectedMonth,
      now: new Date(),
    });
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
  }, [client, rangeMode, selectedDay, selectedMonth, selectedWeek]);

  useEffect(() => {
    const initialTimeoutId = window.setTimeout(() => void load(), 0);
    const intervalId = window.setInterval(() => void load(), presentationMode ? 5_000 : 30_000);
    return () => {
      window.clearTimeout(initialTimeoutId);
      window.clearInterval(intervalId);
    };
  }, [load, presentationMode]);

  const selectedSensorDefinition = overviewSensors.find((sensor) => sensor.key === selectedSensor);
  const activeRange = overviewRanges.find((range) => range.mode === rangeMode);
  const periodLabel = overviewPeriodLabel(rangeMode, selectedDay, selectedWeek, selectedMonth);
  const periodIsCurrent = isCurrentOverviewPeriod(
    rangeMode,
    selectedDay,
    selectedWeek,
    selectedMonth,
  );
  const periodPickerValue =
    rangeMode === 'monthly' ? selectedMonth : rangeMode === 'weekly' ? selectedWeek : selectedDay;
  const periodPickerMax =
    rangeMode === 'monthly'
      ? localMonthInputValue(new Date())
      : rangeMode === 'weekly'
        ? localWeekInputValue(new Date())
        : localDateInputValue(new Date());
  const updatePeriodValue = (value: string) => {
    if (value === '' || value > periodPickerMax) return;
    if (rangeMode === 'monthly') setSelectedMonth(value);
    else if (rangeMode === 'weekly') setSelectedWeek(value);
    else setSelectedDay(value);
  };
  const shiftPeriod = (amount: -1 | 1) => {
    const shifted = shiftOverviewPeriod(rangeMode, periodPickerValue, amount);
    updatePeriodValue(shifted);
  };

  return (
    <section
      className={`overview-dashboard space-y-4 ${presentationView ? 'presentation-view' : ''}`}
    >
      <div className="presentation-toolbar" aria-hidden={!presentationView}>
        <strong>Teknila Siaga Longsor</strong>
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
        <div className="toolbar-range-group">
          <div className="overview-range-control">
            <span className="overview-range-label">Rentang data</span>
            <div className="range-pills" role="group" aria-label="Pilihan rentang waktu">
              {overviewRanges.map((range, index) => (
                <span key={range.mode} className="range-pill-item">
                  {index > 0 && overviewRanges[index - 1]?.group !== range.group && (
                    <span className="range-pill-divider" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    className={rangeMode === range.mode ? 'active' : ''}
                    aria-pressed={rangeMode === range.mode}
                    aria-label={range.label}
                    onClick={() => setRangeMode(range.mode)}
                  >
                    {range.shortLabel}
                  </button>
                </span>
              ))}
            </div>
          </div>
          <label className="sr-only" htmlFor="overview-range">
            Rentang histori
          </label>
          <select
            id="overview-range"
            value={rangeMode}
            onChange={(event) => setRangeMode(event.target.value as OverviewRangeMode)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {overviewRanges.map((range) => (
              <option key={range.mode} value={range.mode}>
                {range.label}
              </option>
            ))}
          </select>
        </div>
        {activeRange?.group === 'period' && (
          <div className="toolbar-period-group">
            <CalendarPeriodPicker
              mode={rangeMode}
              value={periodPickerValue}
              max={periodPickerMax}
              label={periodLabel}
              nextDisabled={periodIsCurrent}
              onChange={updatePeriodValue}
              onPrevious={() => shiftPeriod(-1)}
              onNext={() => shiftPeriod(1)}
            />
          </div>
        )}
        <div className="toolbar-action-group">
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
        </div>
        <p className="toolbar-refresh-status text-xs text-slate-500" aria-live="polite">
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
                  <p className="risk-hero-eyebrow">STATUS RISIKO SAAT INI</p>
                  <strong className="risk-hero-label">{riskLabel[data.data.risk.status]}</strong>
                </div>
                <span className="risk-status-code">
                  <span aria-hidden="true" className="risk-status-dot" />
                  {riskLevelLabel[data.data.risk.status]}
                </span>
              </div>
              <p className="risk-hero-reason">
                {data.data.risk.reasons.map(riskReasonLabel).join(', ') ||
                  'Tidak ada alasan tersedia'}
              </p>
              <p className="risk-standard-note">
                Status Aman berlaku ketika seluruh data sensor valid berada di bawah ambang Waspada.
                Tingkat peringatan terdiri dari Waspada, Siaga, dan Awas. Ambang mengikuti profil
                risiko lokasi.
              </p>
              <div className="risk-hero-meta">
                <span>
                  <span className="risk-online-dot" aria-hidden="true" /> {data.data.risk.freshness}
                </span>
                <span>Data terakhir {formatDate(data.data.risk.observedAt)}</span>
                {!data.data.configured && <span>Perangkat belum dikonfigurasi</span>}
              </div>
            </div>
            <div className="overview-kpis grid gap-3 md:grid-cols-3">
              {overviewSensors.map(({ label, key, unit }) => {
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
              <p>
                {periodLabel}
                {rangeMode === 'weekly' || rangeMode === 'monthly'
                  ? ' · Data diringkas untuk menjaga grafik tetap ringan.'
                  : ''}
              </p>
            </div>
            <p className="history-gap-hint">
              Bagian kosong pada grafik menandakan tidak ada data sensor pada waktu tersebut.
            </p>
          </div>
          <div className="overview-chart-grid grid gap-4">
            {overviewSensors.map(({ label, key, unit }) => (
              <InteractiveChart
                key={key}
                title={label}
                unit={unit}
                values={data.data.series[key]}
                thresholds={data.data.thresholds?.[key]}
                onOpenDetails={() => setSelectedSensor(key)}
              />
            ))}
          </div>
          {selectedSensorDefinition !== undefined && (
            <SensorOverviewDialog
              sensor={selectedSensorDefinition}
              currentValue={data.data.readings[selectedSensorDefinition.key]}
              values={data.data.series[selectedSensorDefinition.key]}
              thresholds={data.data.thresholds?.[selectedSensorDefinition.key]}
              range={data.data.range}
              onClose={() => setSelectedSensor(null)}
            />
          )}
        </>
      )}
    </section>
  );
}

function CalendarPeriodPicker({
  mode,
  value,
  max,
  label,
  nextDisabled,
  onChange,
  onPrevious,
  onNext,
}: {
  readonly mode: OverviewRangeMode;
  readonly value: string;
  readonly max: string;
  readonly label: string;
  readonly nextDisabled: boolean;
  readonly onChange: (value: string) => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}) {
  const type = mode === 'monthly' ? 'month' : mode === 'weekly' ? 'week' : 'date';
  const periodName = mode === 'monthly' ? 'bulan' : mode === 'weekly' ? 'minggu' : 'tanggal';
  return (
    <div className="calendar-period-picker" aria-label={`Pemilih ${periodName}`}>
      <button type="button" aria-label={`${periodName} sebelumnya`} onClick={onPrevious}>
        ‹
      </button>
      <label>
        <span className="sr-only">Pilih {periodName}</span>
        <input
          type={type}
          value={value}
          max={max}
          aria-label={`Pilih ${periodName}`}
          title={label}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <button
        type="button"
        aria-label={`${periodName} berikutnya`}
        disabled={nextDisabled}
        onClick={onNext}
      >
        ›
      </button>
    </div>
  );
}

function SensorOverviewDialog({
  sensor,
  currentValue,
  values,
  thresholds,
  range,
  onClose,
}: {
  readonly sensor: OverviewSensorDefinition;
  readonly currentValue: number | null;
  readonly values: Overview['data']['series'][OverviewSensorKey];
  readonly thresholds?: Threshold | undefined;
  readonly range: Overview['data']['range'];
  readonly onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const validValues = values.filter(
    (point): point is typeof point & { readonly value: number } => point.value !== null,
  );
  const latest = validValues.at(-1) ?? null;
  const effectiveCurrent = currentValue ?? latest?.value ?? null;
  const sensorStatus =
    effectiveCurrent === null || thresholds === undefined
      ? 'Tidak diketahui'
      : effectiveCurrent >= thresholds.danger
        ? 'Siaga (Tingkat 2)'
        : effectiveCurrent >= thresholds.watch
          ? 'Waspada (Tingkat 1)'
          : 'Aman (di luar tingkat peringatan)';

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop sensor-overview-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sensor-overview-title"
        className="dialog-panel sensor-overview-dialog"
      >
        <header className="sensor-overview-header">
          <div className="sensor-overview-title-group">
            <span className="sensor-overview-icon" aria-hidden="true">
              <SensorIcon title={sensor.label} />
            </span>
            <div>
              <p>Overview sensor</p>
              <h2 id="sensor-overview-title">{sensor.label}</h2>
            </div>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="sensor-overview-close"
            aria-label={`Tutup detail ${sensor.label}`}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <p className="sensor-overview-description">{sensor.description}</p>
        <div className="sensor-overview-metrics">
          <SensorOverviewMetric
            label="Pembacaan terkini"
            value={
              effectiveCurrent === null
                ? 'Data tidak tersedia'
                : `${formatSensorValue(effectiveCurrent)} ${sensor.unit}`
            }
          />
          <SensorOverviewMetric label="Posisi terhadap ambang" value={sensorStatus} />
          <SensorOverviewMetric
            label="Data valid"
            value={`${validValues.length} dari ${values.length} pembacaan`}
          />
          <SensorOverviewMetric
            label="Terakhir terbaca"
            value={latest === null ? 'Data tidak tersedia' : formatDate(latest.timestamp)}
          />
        </div>

        <div className="sensor-overview-thresholds">
          <span>
            Rentang {formatDate(range.from)} – {formatDate(range.to)}
          </span>
          {thresholds === undefined ? (
            <span>Ambang belum dikonfigurasi</span>
          ) : (
            <>
              <span className="sensor-threshold sensor-threshold-watch">
                Waspada ≥ {formatSensorValue(thresholds.watch)} {sensor.unit}
              </span>
              <span className="sensor-threshold sensor-threshold-warning">
                Siaga ≥ {formatSensorValue(thresholds.danger)} {sensor.unit}
              </span>
              <span
                className="sensor-threshold sensor-threshold-danger"
                title="Awas dipicu kombinasi kemiringan dan hujan pada ambang Siaga, atau aturan hujan berdurasi."
              >
                Awas · kombinasi/durasi
              </span>
            </>
          )}
        </div>

        <InteractiveChart
          title={sensor.label}
          unit={sensor.unit}
          values={values}
          thresholds={thresholds}
          expanded
        />
        <p className="sensor-overview-note">
          Awas tidak memakai satu angka sensor tersendiri. Status ini dihitung backend dari
          kombinasi kemiringan dan hujan atau aturan hujan berdurasi.
        </p>
      </section>
    </div>
  );
}

function SensorOverviewMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatSensorValue(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value);
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
            <DeviceField label="Terakhir online" value={formatDate(device.lastSeenAt)} />
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
          <h2>Status sensor</h2>
          <p>Ketersediaan data dari pembacaan sensor terbaru.</p>
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
      setMessage(
        'Ambang WASPADA harus lebih rendah dari SIAGA dan keduanya harus berupa angka terbatas.',
      );
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
          <strong className="profile-calibration-status">
            {calibrationStatusLabel(data.calibrationStatus)}
          </strong>
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
            <p>Nilai di bawah ambang Waspada dikategorikan Aman.</p>
            <label>
              <span>WASPADA · TINGKAT 1</span>
              <span className="threshold-input">
                <input
                  aria-label={`${label} WASPADA`}
                  name={`${key}-watch`}
                  defaultValue={thresholds.watch}
                  type="number"
                  step="any"
                />
                <span aria-hidden="true">{unit}</span>
              </span>
            </label>
            <label>
              <span>SIAGA · TINGKAT 2</span>
              <span className="threshold-input">
                <input
                  aria-label={`${label} SIAGA`}
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
      <section className="profile-awas-rule" aria-labelledby="profile-awas-title">
        <div>
          <p>KONDISI AWAS</p>
          <h2 id="profile-awas-title">AWAS · TINGKAT 3</h2>
          <span>
            Status Awas ditentukan dari kombinasi beberapa kondisi, bukan dari satu ambang sensor.
          </span>
        </div>
        <div className="profile-awas-rule-items">
          <div>
            <span>Kombinasi sensor</span>
            <strong>
              Kemiringan ≥ {formatSensorValue(data.tiltMagnitudeDeg.danger)} ° + curah hujan ≥{' '}
              {formatSensorValue(data.rainfallMmHour.danger)} mm/jam
            </strong>
          </div>
          <div>
            <span>Hujan berkelanjutan</span>
            <strong>
              {data.rainfallDuration.consecutiveDays} hari pada{' '}
              {formatSensorValue(data.rainfallDuration.moderateDailyMinMm)}–
              {formatSensorValue(data.rainfallDuration.moderateDailyMaxMm)} mm/hari, lalu hujan
              berlanjut
            </strong>
          </div>
        </div>
      </section>
      <fieldset className="threshold-card threshold-rain-duration">
        <legend>Durasi curah hujan</legend>
        <p>
          Jika curah hujan harian berada pada rentang ini selama beberapa hari berturut-turut, hujan
          lanjutan dapat memicu status Awas.
        </p>
        <label>
          <span>Batas bawah hujan sedang</span>
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
          <span>Batas atas hujan sedang</span>
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
          <span>Ambang hujan lanjutan</span>
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
        Ambang harus ditentukan dari investigasi dan kalibrasi lokasi yang tervalidasi. SNI tidak
        dipakai sebagai sumber angka universal untuk semua lereng.
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
      {data?.data.length === 0 && (
        <div className="audit-empty" role="status">
          <span className="audit-empty-icon" aria-hidden="true">
            ⌁
          </span>
          <div>
            <h2>Belum ada perubahan status risiko.</h2>
            <p>
              Riwayat perubahan status akan muncul di sini setelah sistem mencatat transisi risiko.
            </p>
          </div>
        </div>
      )}
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
    WARNING: 'audit-warning',
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
