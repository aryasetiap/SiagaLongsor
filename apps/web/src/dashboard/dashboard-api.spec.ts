import { describe, expect, it, vi } from 'vitest';

import type { OrganizationApiClient } from '../api/contracts';
import { getDashboardSummary, getSensorSeries } from './dashboard-api';
import { sensorSeriesFixture } from '../../test/phase-04-fixtures';

describe('Phase 04 dashboard API adapters', () => {
  it('sends organization scope and exact summary Site/window query', async () => {
    const client = createClient();
    await getDashboardSummary(client, 'org-1', { siteId: 'site-1', windowHours: 72 });
    expect(client.organizationRequest).toHaveBeenCalledWith(
      '/dashboard/summary?siteId=site-1&windowHours=72',
      'org-1',
    );
  });

  it('builds sensor range, late, cursor, and limit without undefined values', async () => {
    const client = createClient();
    await getSensorSeries(client, 'org-1', 'point/id', {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-02T00:00:00.000Z',
      includeLate: true,
      cursor: 'next',
      limit: 500,
    });
    const path = vi.mocked(client.organizationRequest).mock.calls[0]?.[0];
    expect(path).toBe(
      '/monitoring-points/point%2Fid/sensor-series?from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-02T00%3A00%3A00.000Z&includeLate=true&cursor=next&limit=500',
    );
    expect(path).not.toContain('undefined');
  });

  it('keeps nullable battery and does not assume totalCount', () => {
    expect(sensorSeriesFixture.data.items[1]?.batteryVoltage).toBeNull();
    expect(sensorSeriesFixture.data).not.toHaveProperty('totalCount');
  });
});

function createClient(): OrganizationApiClient {
  return {
    organizationRequest: vi.fn(
      async <T>() => ({ data: {} }) as T,
    ) as OrganizationApiClient['organizationRequest'],
  };
}
