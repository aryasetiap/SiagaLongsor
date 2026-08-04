import type { Site } from '../sites/site-contracts';

export type ReportJobStatus = 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
export interface ReportJob {
  readonly id: string;
  readonly organizationId: string;
  readonly site: Pick<Site, 'id' | 'name'>;
  readonly reportType: 'SITE_PERIOD_SUMMARY_PDF';
  readonly from: string;
  readonly to: string;
  readonly status: ReportJobStatus;
  readonly requestedAt: string;
  readonly failureMessage: string | null;
  readonly artifact: {
    readonly fileName: string;
    readonly mediaType: 'application/pdf';
    readonly sizeBytes: number;
    readonly expiresAt: string;
  } | null;
}
