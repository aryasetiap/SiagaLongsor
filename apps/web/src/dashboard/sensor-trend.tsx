'use client';

import { useEffect, useMemo, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import type { MonitoringOverviewItem } from '../risk/risk-contracts';
import { formatSiteTimestamp } from '../risk/risk-presentation';
import { getSensorSeries } from './dashboard-api';
import type {
  DashboardWindowHours,
  SensorKey,
  SensorSeriesPoint,
  SensorSeriesResponse,
} from './dashboard-contracts';
import { DashboardCard, PanelError, PanelSkeleton } from './panel-ui';

interface Props {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly selected: MonitoringOverviewItem | null;
  readonly windowHours: DashboardWindowHours;
  readonly refreshGeneration: number;
}

const sensorDefinitions = {
  tilt: {
    label: 'Kemiringan',
    unit: '°',
    read: (point: SensorSeriesPoint) => point.tiltMagnitudeDeg,
  },
  moisture: {
    label: 'Kelembapan tanah',
    unit: '%',
    read: (point: SensorSeriesPoint) => point.soilMoisturePct,
  },
  rainfall: {
    label: 'Curah hujan',
    unit: 'mm/jam',
    read: (point: SensorSeriesPoint) => point.rainfallMmHour,
  },
  battery: {
    label: 'Tegangan baterai',
    unit: 'V',
    read: (point: SensorSeriesPoint) => point.batteryVoltage,
  },
} satisfies Record<
  SensorKey,
  {
    readonly label: string;
    readonly unit: string;
    readonly read: (point: SensorSeriesPoint) => number | null;
  }
>;

export function SensorTrend(props: Props) {
  const [sensor, setSensor] = useState<SensorKey>('tilt');
  const [includeLate, setIncludeLate] = useState(false);
  const [result, setResult] = useState<SensorSeriesResponse | null>(null);
  const [range, setRange] = useState<{ readonly from: string; readonly to: string } | null>(null);
  const [failure, setFailure] = useState<{
    readonly key: string;
    readonly error: Error;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const pointId = props.selected?.monitoringPoint.id ?? null;
  const requestKey = JSON.stringify([
    props.organizationId,
    pointId,
    props.windowHours,
    includeLate,
    props.refreshGeneration,
    retry,
  ]);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const current = resultKey === requestKey ? result : null;
  const error = failure?.key === requestKey ? failure.error : null;

  useEffect(() => {
    if (pointId === null) {
      return;
    }
    let active = true;
    const to = new Date();
    const from = new Date(to.getTime() - props.windowHours * 60 * 60_000);
    const normalized = { from: from.toISOString(), to: to.toISOString() };
    void getSensorSeries(props.client, props.organizationId, pointId, {
      ...normalized,
      includeLate,
      limit: 500,
    })
      .then((response) => {
        if (!active) return;
        setRange(normalized);
        setResult(response);
        setResultKey(requestKey);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setFailure({
          key: requestKey,
          error: reason instanceof Error ? reason : new Error('Sensor series gagal dimuat.'),
        });
        setResultKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [includeLate, pointId, props.client, props.organizationId, props.windowHours, requestKey]);

  async function loadMore() {
    if (
      pointId === null ||
      current === null ||
      current.data.nextCursor === null ||
      range === null ||
      loadingMore
    )
      return;
    setLoadingMore(true);
    try {
      const next = await getSensorSeries(props.client, props.organizationId, pointId, {
        ...range,
        includeLate,
        cursor: current.data.nextCursor,
        limit: 500,
      });
      const known = new Set(current.data.items.map((point) => point.telemetryId));
      const items = [
        ...current.data.items,
        ...next.data.items.filter((point) => !known.has(point.telemetryId)),
      ].sort(
        (left, right) =>
          left.recordedAt.localeCompare(right.recordedAt) ||
          left.telemetryId.localeCompare(right.telemetryId),
      );
      setResult({ data: { items, nextCursor: next.data.nextCursor, hasMore: next.data.hasMore } });
    } catch (reason) {
      setFailure({
        key: requestKey,
        error:
          reason instanceof Error ? reason : new Error('Halaman sensor berikutnya gagal dimuat.'),
      });
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <DashboardCard
      title="Sensor Trend"
      description={
        props.selected === null
          ? 'Pilih titik monitoring untuk melihat data sensor.'
          : `${props.selected.monitoringPoint.name} · ${props.selected.site.name}`
      }
      className="min-w-0"
    >
      {props.selected === null ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
          Belum ada titik monitoring yang dipilih.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-700">
              Sensor
              <select
                className="field-input mt-1 min-w-44"
                value={sensor}
                onChange={(event) => setSensor(event.target.value as SensorKey)}
              >
                {Object.entries(sensorDefinitions).map(([key, definition]) => (
                  <option key={key} value={key}>
                    {definition.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={includeLate}
                onChange={(event) => setIncludeLate(event.target.checked)}
              />
              Sertakan data terlambat
            </label>
          </div>
          <div className="mt-4">
            {current === null && error === null && <PanelSkeleton label="Memuat tren sensor" />}
            {error !== null && (
              <PanelError
                title="Data Sensor Trend tidak dapat dimuat."
                error={error}
                onRetry={() => {
                  setFailure(null);
                  setRetry((value) => value + 1);
                }}
              />
            )}
            {current?.data.items.length === 0 && (
              <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
                Tidak ada data sensor pada rentang ini.
              </p>
            )}
            {current !== null && current.data.items.length > 0 && (
              <SensorChart
                points={current.data.items}
                sensor={sensor}
                timezone={props.selected.site.timezone}
              />
            )}
            {current?.data.nextCursor !== null && (
              <button
                type="button"
                className="secondary-button mt-4"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? 'Memuat…' : 'Muat data berikutnya'}
              </button>
            )}
          </div>
        </>
      )}
    </DashboardCard>
  );
}

export function SensorChart({
  points,
  sensor,
  timezone,
}: {
  readonly points: readonly SensorSeriesPoint[];
  readonly sensor: SensorKey;
  readonly timezone: string;
}) {
  const definition = sensorDefinitions[sensor];
  const plotted = useMemo(
    () =>
      points
        .map((point) => ({ point, value: definition.read(point) }))
        .filter(
          (entry): entry is { point: SensorSeriesPoint; value: number } => entry.value !== null,
        ),
    [definition, points],
  );
  if (plotted.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
        Nilai {definition.label.toLowerCase()} tidak tersedia. Nilai kosong tidak diubah menjadi
        nol.
      </p>
    );
  }
  const values = plotted.map((entry) => entry.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const times = plotted.map((entry) => new Date(entry.point.recordedAt).getTime());
  const firstTime = Math.min(...times);
  const lastTime = Math.max(...times);
  const timeSpan = Math.max(lastTime - firstTime, 1);
  const valueSpan = Math.max(maximum - minimum, 1);
  const coordinates = plotted.map((entry) => ({
    ...entry,
    x: 42 + ((new Date(entry.point.recordedAt).getTime() - firstTime) / timeSpan) * 636,
    y: 188 - ((entry.value - minimum) / valueSpan) * 140,
  }));
  const gaps = gapIndexes(coordinates.map((entry) => new Date(entry.point.recordedAt).getTime()));
  const segments = splitAtGaps(coordinates, gaps);
  const lateCount = points.filter((point) => point.isLate).length;
  const summary = `${definition.label}: ${plotted.length} titik, minimum ${formatNumber(minimum)} ${definition.unit}, maksimum ${formatNumber(maximum)} ${definition.unit}, dari ${formatSiteTimestamp(plotted[0]?.point.recordedAt ?? null, timezone)} sampai ${formatSiteTimestamp(plotted.at(-1)?.point.recordedAt ?? null, timezone)}, ${lateCount} data terlambat, ${gaps.size} gap terlihat.`;
  return (
    <figure>
      <p
        id={`sensor-summary-${sensor}`}
        className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700"
      >
        {summary}
      </p>
      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox="0 0 720 230"
          className="h-auto min-w-[36rem] w-full"
          role="img"
          aria-labelledby={`sensor-title-${sensor} sensor-summary-${sensor}`}
        >
          <title id={`sensor-title-${sensor}`}>Grafik {definition.label}</title>
          <line x1="42" y1="48" x2="42" y2="188" stroke="#94a3b8" />
          <line x1="42" y1="188" x2="678" y2="188" stroke="#94a3b8" />
          <text x="8" y="52" fontSize="11" fill="#475569">
            {formatNumber(maximum)}
          </text>
          <text x="8" y="191" fontSize="11" fill="#475569">
            {formatNumber(minimum)}
          </text>
          {segments.map((segment, index) =>
            segment.length > 1 ? (
              <polyline
                key={index}
                fill="none"
                stroke="#0369a1"
                strokeWidth="3"
                points={segment.map((entry) => `${entry.x},${entry.y}`).join(' ')}
              />
            ) : null,
          )}
          {coordinates.map((entry) =>
            entry.point.isLate ? (
              <path
                key={entry.point.telemetryId}
                d={`M ${entry.x} ${entry.y - 6} L ${entry.x + 6} ${entry.y} L ${entry.x} ${entry.y + 6} L ${entry.x - 6} ${entry.y} Z`}
                fill="#7c3aed"
                stroke="white"
              >
                <title>
                  Data terlambat: {entry.value} {definition.unit}
                </title>
              </path>
            ) : (
              <circle
                key={entry.point.telemetryId}
                cx={entry.x}
                cy={entry.y}
                r="4"
                fill="#0369a1"
                stroke="white"
                strokeWidth="2"
              >
                <title>
                  {entry.value} {definition.unit}
                </title>
              </circle>
            ),
          )}
          {gaps.size > 0 &&
            [...gaps].map((index) => {
              const left = coordinates[index];
              const right = coordinates[index + 1];
              if (left === undefined || right === undefined) return null;
              const x = (left.x + right.x) / 2;
              return (
                <g key={`gap-${index}`}>
                  <line x1={x} y1="48" x2={x} y2="188" stroke="#f59e0b" strokeDasharray="5 5" />
                  <text x={x + 4} y="64" fontSize="10" fill="#92400e">
                    Gap
                  </text>
                </g>
              );
            })}
        </svg>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        <span aria-hidden="true" className="font-black text-violet-700">
          ◆
        </span>{' '}
        Data terlambat ditandai bentuk wajik. Garis putus-putus menandai gap; UI tidak
        menginterpolasi data.
      </p>
    </figure>
  );
}

function gapIndexes(times: readonly number[]): ReadonlySet<number> {
  const intervals = times
    .slice(1)
    .map((time, index) => time - (times[index] ?? time))
    .filter((value) => value > 0);
  if (intervals.length < 2) return new Set();
  const baseline = Math.min(...intervals);
  return new Set(
    intervals.flatMap((interval, index) => (interval > baseline * 2.5 ? [index] : [])),
  );
}

function splitAtGaps<T>(
  values: readonly T[],
  gaps: ReadonlySet<number>,
): readonly (readonly T[])[] {
  const segments: T[][] = [[]];
  values.forEach((value, index) => {
    segments.at(-1)?.push(value);
    if (gaps.has(index)) segments.push([]);
  });
  return segments.filter((segment) => segment.length > 0);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value);
}
