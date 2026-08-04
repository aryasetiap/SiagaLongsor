import type { DataEnvelope, ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { appendQuery } from '../api/query-string';
import type { ReportJob } from './reports-contracts';
export const listReportJobs = (
  c: OrganizationApiClient,
  o: string,
  q: { siteId?: string; cursor?: string } = {},
) =>
  c.organizationRequest<ListEnvelope<ReportJob>>(
    appendQuery('/report-jobs', {
      siteId: q.siteId,
      cursor: q.cursor,
      limit: 25,
      reportType: 'SITE_PERIOD_SUMMARY_PDF',
    }),
    o,
  );
export const getReportJob = (c: OrganizationApiClient, o: string, id: string) =>
  c.organizationRequest<DataEnvelope<ReportJob>>(`/report-jobs/${encodeURIComponent(id)}`, o);
export const createReportJob = (
  c: OrganizationApiClient,
  o: string,
  input: { siteId: string; from: string; to: string },
) =>
  c.organizationRequest<DataEnvelope<ReportJob>>('/report-jobs', o, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportType: 'SITE_PERIOD_SUMMARY_PDF', ...input }),
  });
export async function downloadReport(
  c: OrganizationApiClient,
  o: string,
  path: string,
  name: string,
) {
  if (!c.organizationDownload) throw new Error('Authenticated download is unavailable.');
  const blob = await (await c.organizationDownload(path, o)).blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
export const downloadCsv = (
  c: OrganizationApiClient,
  o: string,
  q: { siteId: string; from: string; to: string; monitoringPointId?: string },
) => downloadReport(c, o, appendQuery('/reports/telemetry.csv', q), 'telemetry.csv');
