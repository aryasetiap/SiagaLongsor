'use client';

import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import type { SeriesPoint, Threshold } from './single-device-contracts';

echarts.use([
  LineChart,
  ScatterChart,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export interface ChartStats {
  readonly current: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly average: number | null;
}
export function chartStats(points: readonly SeriesPoint[]): ChartStats {
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  return values.length
    ? {
        current: values.at(-1) ?? null,
        min: Math.min(...values),
        max: Math.max(...values),
        average: values.reduce((a, b) => a + b, 0) / values.length,
      }
    : { current: null, min: null, max: null, average: null };
}
export function chartData(points: readonly SeriesPoint[]): readonly [number, number | null][] {
  return points.map((point) => [new Date(point.timestamp).getTime(), point.value]);
}
export function chartOption({
  title,
  unit,
  values,
  thresholds,
  color,
  reducedMotion,
}: {
  readonly title: string;
  readonly unit: string;
  readonly values: readonly SeriesPoint[];
  readonly thresholds?: Threshold | undefined;
  readonly color: string;
  readonly reducedMotion: boolean;
}) {
  const data = chartData(values);
  const last = [...data].reverse().find((point) => point[1] !== null) ?? null;
  const lines = thresholds
    ? [
        {
          yAxis: thresholds.watch,
          name: `WASPADA ${thresholds.watch} ${unit}`,
          lineStyle: { color: '#b45309', type: 'dashed' },
          label: { position: 'insideStartTop', color: '#92400e', fontSize: 10, fontWeight: 700 },
        },
        {
          yAxis: thresholds.danger,
          name: `SIAGA ${thresholds.danger} ${unit}`,
          lineStyle: { color: '#b91c1c', type: 'dashed' },
          label: { position: 'insideStartBottom', color: '#991b1b', fontSize: 10, fontWeight: 700 },
        },
      ]
    : [];
  return {
    animation: !reducedMotion,
    animationDuration: 280,
    grid: { left: 42, right: 12, top: 18, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'line' },
      backgroundColor: '#164b7a',
      borderWidth: 0,
      borderRadius: 12,
      padding: [9, 11],
      textStyle: { color: '#f8fbfa', fontSize: 12 },
      extraCssText: 'box-shadow: 0 12px 28px rgba(15, 23, 42, .22);',
      formatter: (items: readonly { value: [number, number | null] }[]) => {
        const item = items[0];
        return item === undefined
          ? ''
          : `${new Date(item.value[0]).toLocaleString('id-ID')}<br/><b>${title}</b> ${item.value[1] === null ? 'Data tidak tersedia' : `${format(item.value[1])} ${unit}`}`;
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: {
        fontSize: 10,
        color: '#64748b',
        hideOverlap: true,
        formatter: (value: number) =>
          new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { fontSize: 10, color: '#64748b', formatter: (value: number) => format(value) },
      splitNumber: 3,
      splitLine: { lineStyle: { color: '#e9efed', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: title,
        type: 'line',
        data,
        showSymbol: false,
        symbol: 'none',
        smooth: false,
        connectNulls: false,
        lineStyle: { color, width: 2.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `${color}29` },
            { offset: 1, color: `${color}04` },
          ]),
        },
        markLine: lines.length ? { silent: true, symbol: 'none', data: lines } : undefined,
      },
      {
        name: 'Terkini',
        type: 'scatter',
        data: last ? [last] : [],
        symbolSize: 9,
        itemStyle: { color, borderColor: '#fff', borderWidth: 2 },
        silent: true,
      },
    ],
  } as const;
}

const COLOR: Record<string, string> = {
  Kemiringan: '#4f46e5',
  'Kelembapan tanah': '#0f766e',
  'Curah hujan': '#0284c7',
};
export function InteractiveChart({
  title,
  unit,
  values,
  thresholds,
  expanded = false,
  onOpenDetails,
}: {
  readonly title: string;
  readonly unit: string;
  readonly values: readonly SeriesPoint[];
  readonly thresholds?: Threshold | undefined;
  readonly expanded?: boolean;
  readonly onOpenDetails?: (() => void) | undefined;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const id = useId();
  const stats = chartStats(values);
  const option = useMemo(
    () =>
      chartOption({
        title,
        unit,
        values,
        thresholds,
        color: COLOR[title] ?? '#0284c7',
        reducedMotion:
          typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      }),
    [title, unit, values, thresholds],
  );
  useEffect(() => {
    if (process.env.NODE_ENV === 'test' || host.current === null) return;
    const instance = echarts.init(host.current);
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);
  const openOnKeyboard = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (onOpenDetails !== undefined && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onOpenDetails();
    }
  };
  return (
    <article
      className={`chart-card min-w-0 bg-white ${expanded ? 'chart-card-expanded' : ''} ${onOpenDetails === undefined ? '' : 'chart-card-clickable'}`}
      role={onOpenDetails === undefined ? undefined : 'button'}
      tabIndex={onOpenDetails === undefined ? undefined : 0}
      aria-label={onOpenDetails === undefined ? undefined : `Buka detail sensor ${title}`}
      onClick={onOpenDetails}
      onKeyDown={openOnKeyboard}
    >
      <header className="chart-card-header">
        <div>
          <h2 id={id} className="font-bold text-slate-950">
            {title}
          </h2>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">
            {stats.current === null ? '—' : `${format(stats.current)} ${unit}`}
          </p>
        </div>
        <div className="chart-card-summary">
          <dl className="chart-card-stats">
            <Metric label="Min" value={stats.min} unit={unit} />
            <Metric label="Avg" value={stats.average} unit={unit} />
            <Metric label="Maks" value={stats.max} unit={unit} />
          </dl>
          {onOpenDetails !== undefined && (
            <span className="chart-card-open-hint" aria-hidden="true">
              Lihat detail <span>↗</span>
            </span>
          )}
        </div>
      </header>
      {stats.current === null ? (
        <div className="chart-empty-state grid place-items-center text-sm text-slate-500">
          Belum ada pembacaan sensor.
        </div>
      ) : (
        <div
          ref={host}
          role="img"
          aria-labelledby={id}
          aria-label={`${title}, pembacaan terkini ${stats.current} ${unit}`}
          className={`mt-3 w-full min-w-0 ${expanded ? 'h-80' : 'h-52'}`}
        />
      )}
    </article>
  );
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
      <dd className="font-semibold tabular-nums text-slate-700">
        {value === null ? '—' : `${format(value)} ${unit}`}
      </dd>
    </div>
  );
}
function format(value: number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value);
}
