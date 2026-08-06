import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { chartPoints, chartStats, formatChartTooltip, InteractiveChart } from './interactive-chart';

const points = [
  { timestamp: '2026-01-01T00:00:00.000Z', value: 10 },
  { timestamp: '2026-01-01T00:01:00.000Z', value: 12 },
  { timestamp: '2026-01-01T00:09:00.000Z', value: null },
  { timestamp: '2026-01-01T00:10:00.000Z', value: 16 },
] as const;

describe('InteractiveChart', () => {
  it('uses real timestamps for X position and preserves a null gap', () => {
    const plotted = chartPoints(points);
    expect(plotted[1]?.x).toBeLessThan(200);
    expect(plotted[2]?.x).toBeGreaterThan(500);
    expect(plotted[2]?.y).toBeNaN();
  });

  it('calculates statistics from non-null readings and formats tooltip values', () => {
    expect(chartStats(points)).toEqual({ current: 16, min: 10, max: 16, average: 38 / 3 });
    expect(formatChartTooltip(points[1]!, '%')).toContain('12 %');
  });

  it('renders independent polylines around null data and exposes tooltip on keyboard focus', async () => {
    const user = userEvent.setup();
    const { container } = render(<InteractiveChart title="Kelembapan" unit="%" values={points} />);
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
    await user.tab();
    expect(screen.getByRole('status')).toHaveTextContent('10 %');
  });
});
