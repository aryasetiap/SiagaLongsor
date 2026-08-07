import { describe, expect, it } from 'vitest';

import { chartData, chartOption, chartStats } from './interactive-chart';

const points = [
  { timestamp: '2026-01-01T00:00:00.000Z', value: 10 },
  { timestamp: '2026-01-01T00:01:00.000Z', value: 12 },
  { timestamp: '2026-01-01T00:09:00.000Z', value: null },
  { timestamp: '2026-01-01T00:10:00.000Z', value: 16 },
] as const;

describe('InteractiveChart ECharts data', () => {
  it('keeps timestamps and null gaps intact', () => {
    expect(chartData(points)).toEqual([
      [1767225600000, 10],
      [1767225660000, 12],
      [1767226140000, null],
      [1767226200000, 16],
    ]);
    const option = chartOption({
      title: 'Kemiringan',
      unit: '°',
      values: points,
      color: '#4f46e5',
      reducedMotion: false,
    });
    expect(option.series[0].connectNulls).toBe(false);
    expect(option.series[0].smooth).toBe(false);
  });
  it('uses only supplied profile thresholds', () => {
    const supplied = chartOption({
      title: 'Kemiringan',
      unit: '°',
      values: points,
      thresholds: { watch: 4, danger: 9 },
      color: '#4f46e5',
      reducedMotion: true,
    });
    const absent = chartOption({
      title: 'Kemiringan',
      unit: '°',
      values: points,
      color: '#4f46e5',
      reducedMotion: true,
    });
    expect(supplied.series[0].markLine?.data).toHaveLength(2);
    expect(absent.series[0].markLine).toBeUndefined();
    expect(chartStats(points)).toEqual({ current: 16, min: 10, max: 16, average: 38 / 3 });
  });
});
