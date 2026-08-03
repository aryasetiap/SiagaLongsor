import type { ReportFailureCode, ReportJobStatus, ReportType } from '../generated/prisma/enums.js';

export interface ReportArtifactData {
  readonly fileName: string;
  readonly mediaType: 'application/pdf';
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly generatedAt: string;
  readonly expiresAt: string;
}

export interface ReportJobData {
  readonly id: string;
  readonly organizationId: string;
  readonly site: { readonly id: string; readonly name: string; readonly timezone: string };
  readonly reportType: ReportType;
  readonly from: string;
  readonly to: string;
  readonly status: ReportJobStatus;
  readonly createdBy: { readonly id: string; readonly name: string };
  readonly requestedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly expiresAt: string | null;
  readonly failureCode: ReportFailureCode | null;
  readonly failureMessage: string | null;
  readonly artifact: ReportArtifactData | null;
}

export interface ReportJobResponse {
  readonly data: ReportJobData;
}

export interface ReportJobListResponse {
  readonly data: readonly ReportJobData[];
  readonly page: { readonly nextCursor: string | null; readonly hasMore: boolean };
}
