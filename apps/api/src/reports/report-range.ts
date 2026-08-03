import { BadRequestException } from '@nestjs/common';

export const MAX_REPORT_RANGE_MS = 31 * 24 * 60 * 60 * 1000;

export interface ReportRange {
  readonly from: Date;
  readonly to: Date;
}

export function parseReportRange(fromValue: string, toValue: string): ReportRange {
  const from = new Date(fromValue);
  const to = new Date(toValue);
  const duration = to.getTime() - from.getTime();
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    duration <= 0 ||
    duration > MAX_REPORT_RANGE_MS
  ) {
    throw new BadRequestException({
      code: 'INVALID_TIME_RANGE',
      message: 'Rentang waktu harus berurutan dan tidak melebihi 31 hari.',
    });
  }
  return { from, to };
}
