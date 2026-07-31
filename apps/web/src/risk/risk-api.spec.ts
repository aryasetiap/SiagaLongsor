import { describe, expect, it, vi } from 'vitest';

import type { OrganizationApiClient } from '../api/contracts';
import {
  getAlert,
  getRiskProfile,
  listAlerts,
  listMonitoringOverview,
  listRiskAssessments,
  updateRiskProfile,
} from './risk-api';
import { profileFixture } from '../../test/phase-03-fixtures';

describe('Phase 03 API adapters', () => {
  it('forwards organization scope and exact overview filters without undefined values', async () => {
    const client = createClient();
    await listMonitoringOverview(client, ' org-1 ', {
      siteId: 'site-1',
      riskLevel: 'DANGER',
      connectivityStatus: 'ONLINE',
      search: 'lereng',
      cursor: 'cursor-1',
      limit: 25,
      sort: 'risk:desc',
    });
    const [path, organizationId] = vi.mocked(client.organizationRequest).mock.calls[0] ?? [];
    expect(organizationId).toBe(' org-1 ');
    expect(path).toBe(
      '/monitoring-overview?siteId=site-1&riskLevel=DANGER&connectivityStatus=ONLINE&search=lereng&cursor=cursor-1&limit=25&sort=risk%3Adesc',
    );
    expect(path).not.toContain('undefined');
  });

  it('builds history, alert list/detail, and profile paths with the active organization', async () => {
    const client = createClient();
    await listRiskAssessments(client, 'org-1', 'point/id', { cursor: 'next', limit: 100 });
    await listAlerts(client, 'org-1', {
      monitoringPointId: 'point-1',
      type: 'RISK_WATCH',
      severity: 'WARNING',
      status: 'ACTIVE',
      sort: 'lastObservedAt:desc',
    });
    await getAlert(client, 'org-1', 'alert/id');
    await getRiskProfile(client, 'org-1', 'site/id');
    const profileConfiguration = {
      calibrationStatus: profileFixture.calibrationStatus,
      thresholds: profileFixture.thresholds,
      technicalRanges: profileFixture.technicalRanges,
      freshness: profileFixture.freshness,
      hysteresis: profileFixture.hysteresis,
      notes: profileFixture.notes,
    };
    await updateRiskProfile(client, 'org-1', 'site/id', profileConfiguration);

    const calls = vi.mocked(client.organizationRequest).mock.calls;
    expect(calls.map(([path]) => path)).toEqual([
      '/monitoring-points/point%2Fid/risk-assessments?cursor=next&limit=100',
      '/alerts?monitoringPointId=point-1&type=RISK_WATCH&severity=WARNING&status=ACTIVE&sort=lastObservedAt%3Adesc',
      '/alerts/alert%2Fid',
      '/sites/site%2Fid/risk-profile',
      '/sites/site%2Fid/risk-profile',
    ]);
    expect(calls.every(([, organizationId]) => organizationId === 'org-1')).toBe(true);
    expect(calls[4]?.[2]).toMatchObject({
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
    });
    expect(calls.map(([path]) => path).join('')).not.toContain('undefined');
  });

  it('accepts nullable fields and list responses without totalCount', async () => {
    const response = {
      data: [{ ...profileFixture, notes: null }],
      page: { nextCursor: null, hasMore: false },
    };
    expect(response).not.toHaveProperty('totalCount');
    expect(response.data[0]?.notes).toBeNull();
  });
});

function createClient(): OrganizationApiClient {
  return {
    organizationRequest: vi.fn(
      async <T>() =>
        ({
          data: [],
          page: { nextCursor: null, hasMore: false },
        }) as T,
    ) as OrganizationApiClient['organizationRequest'],
  };
}
