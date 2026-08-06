'use client';

import { useId, useMemo, useState } from 'react';

import type { SeriesPoint } from './single-device-contracts';

const CHART_WIDTH = 760;
const CHART_HEIGHT = 250;
const PADDING = { top: 18, right: 22, bottom: 42, left: 56 };

export interface ChartStats {
  readonly current: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly average: number | null;
}

export interface ChartPoint extends SeriesPoint {
  readonly x: number;
  readonly y: number;
}

export function chartStats(points: readonly SeriesPoint[]): ChartStats {
  const values = points.flatMap((point) => (point.value === null ? [] : [point.value]));
  if (values.length === 0) return { current: null, min: null, max: null, average: null };
  return {
    current: values.at(-1) ?? null,
    min: Math.min(...values),
    max: Math.max(...values),
    average: values.reduce((total, value) => total + value, 0) / values.length,
  };
}

export function chartPoints(points: readonly SeriesPoint[]): readonly ChartPoint[] {
  const timestamps = points.map((point) => new Date(point.timestamp).getTime());
  const validValues = points.flatMap((point) => (point.value === null ? [] : [point.value]));
  const timeMin = Math.min(...timestamps);
  const timeMax = Math.max(...timestamps);
  const valueMin = Math.min(...validValues);
  const valueMax = Math.max(...validValues);
  const timeSpan = Math.max(timeMax - timeMin, 1);
  const valueSpan = Math.max(valueMax - valueMin, Math.max(Math.abs(valueMax) * 0.1, 1));
  const paddedMin = valueMin - valueSpan * 0.12;
  const paddedMax = valueMax + valueSpan * 0.12;
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  return points.map((point, index) => ({
    ...point,
    x: PADDING.left + (((timestamps[index] ?? timeMin) - timeMin) / timeSpan) * plotWidth,
    y:
      point.value === null
        ? Number.NaN
        : PADDING.top + ((paddedMax - point.value) / (paddedMax - paddedMin)) * plotHeight,
  }));
}

export function formatChartTooltip(point: SeriesPoint, unit: string): string {
  return `${new Date(point.timestamp).toLocaleString('id-ID')} · ${point.value === null ? 'Data tidak tersedia' : `${formatNumber(point.value)} ${unit}`}`;
}

export function InteractiveChart({
  title,
  unit,
  values,
}: {
  readonly title: string;
  readonly unit: string;
  readonly values: readonly SeriesPoint[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const labelId = useId();
  const valid = values.some((point) => point.value !== null);
  const plotted = useMemo(() => (valid ? chartPoints(values) : []), [valid, values]);
  const stats = chartStats(values);
  const active = activeIndex === null ? null : (plotted[activeIndex] ?? null);
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const validPoints = plotted.filter((point) => point.value !== null);
  const valueMin = stats.min ?? 0;
  const valueMax = stats.max ?? 0;
  const range = Math.max(valueMax - valueMin, Math.max(Math.abs(valueMax) * 0.1, 1));
  const yMin = valueMin - range * 0.12;
  const yMax = valueMax + range * 0.12;
  const segments = segmentsOf(plotted);

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={labelId} className="text-lg font-bold text-slate-950">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">Riwayat sensor ({unit})</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-right text-xs text-slate-500 sm:grid-cols-4">
          <Metric label="Terkini" value={stats.current} unit={unit} />
          <Metric label="Min" value={stats.min} unit={unit} />
          <Metric label="Maks" value={stats.max} unit={unit} />
          <Metric label="Rata-rata" value={stats.average} unit={unit} />
        </dl>
      </div>
      {!valid ? (
        <div className="mt-5 grid h-56 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-600">
          Belum ada pembacaan sensor yang tersedia pada rentang ini.
        </div>
      ) : (
        <div className="relative mt-4">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-64 w-full"
            aria-labelledby={labelId}
            role="img"
          >
            {[0, 1, 2, 3, 4].map((index) => {
              const y = PADDING.top + (index / 4) * plotHeight;
              const value = yMax - (index / 4) * (yMax - yMin);
              return (
                <g key={index}>
                  <line
                    x1={PADDING.left}
                    x2={PADDING.left + plotWidth}
                    y1={y}
                    y2={y}
                    stroke="#e2e8f0"
                  />
                  <text
                    x={PADDING.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="11"
                  >
                    {formatNumber(value)}
                  </text>
                </g>
              );
            })}
            {timeLabels(plotted).map(({ index, label }) => (
              <text
                key={index}
                x={plotted[index]?.x}
                y={CHART_HEIGHT - 14}
                textAnchor="middle"
                fill="#64748b"
                fontSize="11"
              >
                {label}
              </text>
            ))}
            {segments.map((segment, index) => (
              <polyline
                key={index}
                fill="none"
                stroke="#0369a1"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                points={segment.map((point) => `${point.x},${point.y}`).join(' ')}
              />
            ))}
            {active !== null && active.value !== null && (
              <>
                <line
                  x1={active.x}
                  x2={active.x}
                  y1={PADDING.top}
                  y2={PADDING.top + plotHeight}
                  stroke="#0f172a"
                  strokeDasharray="4 4"
                />
                <circle
                  cx={active.x}
                  cy={active.y}
                  r="5"
                  fill="#0369a1"
                  stroke="white"
                  strokeWidth="2"
                />
              </>
            )}
            {validPoints.map((point) => (
              <circle
                key={point.timestamp}
                cx={point.x}
                cy={point.y}
                r="9"
                fill="transparent"
                tabIndex={0}
                aria-label={formatChartTooltip(point, unit)}
                onFocus={() => setActiveIndex(plotted.indexOf(point))}
                onMouseEnter={() => setActiveIndex(plotted.indexOf(point))}
              />
            ))}
          </svg>
          {active !== null && active.value !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-lg"
              style={{ left: `${Math.min(82, Math.max(4, (active.x / CHART_WIDTH) * 100))}%` }}
            >
              {formatChartTooltip(active, unit)}
            </div>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Pembacaan tidak tersedia ditampilkan sebagai celah tanpa garis penghubung.
      </p>
    </article>
  );
}

function segmentsOf(points: readonly ChartPoint[]): readonly (readonly ChartPoint[])[] {
  const result: ChartPoint[][] = [];
  let current: ChartPoint[] = [];
  for (const point of points) {
    if (point.value === null) {
      if (current.length > 0) result.push(current);
      current = [];
    } else current.push(point);
  }
  if (current.length > 0) result.push(current);
  return result;
}
function timeLabels(points: readonly ChartPoint[]) {
  return [0, 0.5, 1].map((ratio) => {
    const index = Math.round((points.length - 1) * ratio);
    return {
      index,
      label: new Date(points[index]?.timestamp ?? 0).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  });
}
function Metric({
  label,
  value,
  unit,
}: {
  readonly label: string;
  readonly value: number | null;
  readonly unit: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="font-bold text-slate-800">
        {value === null ? '—' : `${formatNumber(value)} ${unit}`}
      </dd>
    </div>
  );
}
function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value);
}
