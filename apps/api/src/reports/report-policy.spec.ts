import { describe, expect, it } from 'vitest';

import { ReportFailureCode, ReportJobStatus } from '../generated/prisma/enums.js';
import {
  canTransition,
  failureCodeOf,
  reportExpiresAt,
  ReportProcessingError,
  sanitizedFailure,
} from './report-policy.js';

describe('report lifecycle policy', () => {
  it('allows only the contract lifecycle', () => {
    expect(canTransition(ReportJobStatus.QUEUED, ReportJobStatus.PROCESSING)).toBe(true);
    expect(canTransition(ReportJobStatus.PROCESSING, ReportJobStatus.SUCCEEDED)).toBe(true);
    expect(canTransition(ReportJobStatus.SUCCEEDED, ReportJobStatus.EXPIRED)).toBe(true);
  });

  it('rejects reopen and regeneration mutations', () => {
    expect(canTransition(ReportJobStatus.FAILED, ReportJobStatus.QUEUED)).toBe(false);
    expect(canTransition(ReportJobStatus.EXPIRED, ReportJobStatus.PROCESSING)).toBe(false);
    expect(canTransition(ReportJobStatus.SUCCEEDED, ReportJobStatus.PROCESSING)).toBe(false);
  });

  it('calculates exactly 90 days from successful generation', () => {
    expect(reportExpiresAt(new Date('2026-08-01T05:00:10.000Z')).toISOString()).toBe(
      '2026-10-30T05:00:10.000Z',
    );
  });

  it('uses bounded safe failures without provider details', () => {
    const message = sanitizedFailure(ReportFailureCode.REPORT_ARTIFACT_UNAVAILABLE);
    expect(message.length).toBeLessThanOrEqual(500);
    expect(message).not.toMatch(/redis|sql|bucket|object|stack|path/i);
    expect(
      failureCodeOf(new ReportProcessingError(ReportFailureCode.REPORT_ARTIFACT_UNAVAILABLE)),
    ).toBe(ReportFailureCode.REPORT_ARTIFACT_UNAVAILABLE);
  });
});
