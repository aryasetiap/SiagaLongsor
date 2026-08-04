import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrganizationApiClient } from '../api/contracts';
import { createReportJob, downloadCsv, downloadReport, listReportJobs } from './reports-api';

describe('Reports API contract', () => {
  afterEach(() => vi.restoreAllMocks());
  it('uses the exact CSV query and authenticated binary download without public URLs', async () => {
    const download = vi.fn().mockResolvedValue(new Response(new Blob(['csv'])));
    const client: OrganizationApiClient = {
      organizationRequest: vi.fn() as never,
      organizationDownload: download,
    };
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.useFakeTimers();
    await downloadCsv(client, 'org-1', {
      siteId: 'site 1',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-02T00:00:00.000Z',
      monitoringPointId: 'point-1',
    });
    expect(download).toHaveBeenCalledWith(
      '/reports/telemetry.csv?siteId=site+1&from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z&monitoringPointId=point-1',
      'org-1',
    );
    await vi.runAllTimersAsync();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:csv');
    vi.useRealTimers();
  });
  it('creates/list jobs with frozen DTO, cursor, no totalCount, and private PDF content', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ data: job(), page: { nextCursor: null, hasMore: false } });
    const download = vi.fn().mockResolvedValue(new Response(new Blob(['pdf'])));
    const c: OrganizationApiClient = {
      organizationRequest: request as never,
      organizationDownload: download,
    };
    await createReportJob(c, 'org-1', {
      siteId: 'site-1',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-02T00:00:00.000Z',
    });
    await listReportJobs(c, 'org-1', { siteId: 'site-1', cursor: 'opaque' });
    await downloadReport(c, 'org-1', '/report-jobs/job-1/content', 'report.pdf');
    expect(JSON.parse(String(request.mock.calls[0]?.[2]?.body))).toEqual({
      reportType: 'SITE_PERIOD_SUMMARY_PDF',
      siteId: 'site-1',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-02T00:00:00.000Z',
    });
    expect(request.mock.calls[1]?.[0]).toContain('cursor=opaque');
    expect(download).toHaveBeenCalledWith('/report-jobs/job-1/content', 'org-1');
  });
});
function job() {
  return {
    id: 'job-1',
    organizationId: 'org-1',
    site: { id: 'site-1', name: 'Site' },
    reportType: 'SITE_PERIOD_SUMMARY_PDF' as const,
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-02T00:00:00.000Z',
    status: 'QUEUED' as const,
    requestedAt: '2026-01-01T00:00:00.000Z',
    failureMessage: null,
    artifact: null,
  };
}
