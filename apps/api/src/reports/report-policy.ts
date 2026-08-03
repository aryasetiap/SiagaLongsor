import { ReportFailureCode, ReportJobStatus } from '../generated/prisma/enums.js';

export const REPORT_ARTIFACT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const transitions: Readonly<Record<ReportJobStatus, readonly ReportJobStatus[]>> = {
  [ReportJobStatus.QUEUED]: [ReportJobStatus.PROCESSING, ReportJobStatus.FAILED],
  [ReportJobStatus.PROCESSING]: [ReportJobStatus.SUCCEEDED, ReportJobStatus.FAILED],
  [ReportJobStatus.SUCCEEDED]: [ReportJobStatus.EXPIRED],
  [ReportJobStatus.FAILED]: [],
  [ReportJobStatus.EXPIRED]: [],
};

export function canTransition(from: ReportJobStatus, to: ReportJobStatus): boolean {
  return transitions[from].includes(to);
}

export function reportExpiresAt(generatedAt: Date): Date {
  return new Date(generatedAt.getTime() + REPORT_ARTIFACT_RETENTION_MS);
}

export function sanitizedFailure(code: ReportFailureCode): string {
  return code === ReportFailureCode.REPORT_ARTIFACT_UNAVAILABLE
    ? 'Artefak laporan tidak dapat disimpan atau diakses.'
    : 'Laporan tidak dapat dibuat setelah beberapa percobaan.';
}

export class ReportProcessingError extends Error {
  constructor(readonly failureCode: ReportFailureCode) {
    super(sanitizedFailure(failureCode));
    this.name = failureCode;
  }
}

export function failureCodeOf(error: Error): ReportFailureCode {
  return error.name === ReportFailureCode.REPORT_ARTIFACT_UNAVAILABLE
    ? ReportFailureCode.REPORT_ARTIFACT_UNAVAILABLE
    : ReportFailureCode.REPORT_GENERATION_FAILED;
}
