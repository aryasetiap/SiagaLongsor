import { BadRequestException, Injectable } from '@nestjs/common';

import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import type { SensorSeriesQueryDto } from './dto/dashboard.dto.js';
import type { NormalizedSensorRange } from './dashboard.types.js';

const ORDERING = 'recordedAt:asc,telemetryId:asc';
const CURSOR_TTL_MS = 24 * 60 * 60 * 1000;

export interface SensorSeriesBoundary {
  readonly telemetryId: string;
  readonly recordedAt: Date;
  readonly range: NormalizedSensorRange;
}

interface SerializedBoundary {
  readonly recordedAt: string;
  readonly from: string;
  readonly to: string;
  readonly expiresAt: string;
}

@Injectable()
export class SensorSeriesCursorService {
  constructor(private readonly cursors: SignedCursorService) {}

  encode(
    organizationId: string,
    monitoringPointId: string,
    includeLate: boolean,
    boundary: Omit<SensorSeriesBoundary, 'range'>,
    range: NormalizedSensorRange,
    now = new Date(),
  ): string {
    const value: SerializedBoundary = {
      recordedAt: boundary.recordedAt.toISOString(),
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      expiresAt: new Date(now.getTime() + CURSOR_TTL_MS).toISOString(),
    };
    return this.cursors.encode(this.context(organizationId, monitoringPointId, includeLate), {
      id: boundary.telemetryId,
      value: JSON.stringify(value),
    });
  }

  decode(
    cursor: string,
    organizationId: string,
    monitoringPointId: string,
    query: SensorSeriesQueryDto,
    now = new Date(),
  ): SensorSeriesBoundary {
    const boundary = this.cursors.decode(
      cursor,
      this.context(organizationId, monitoringPointId, query.includeLate),
    );
    try {
      if (typeof boundary.value !== 'string') throw new Error('Invalid value');
      const serialized = JSON.parse(boundary.value) as Partial<SerializedBoundary>;
      const recordedAt = parseCanonicalDate(serialized.recordedAt);
      const from = parseCanonicalDate(serialized.from);
      const to = parseCanonicalDate(serialized.to);
      const expiresAt = parseCanonicalDate(serialized.expiresAt);
      if (expiresAt <= now) throw new Error('Expired cursor');
      if (query.from !== undefined && new Date(query.from).toISOString() !== from.toISOString()) {
        throw new Error('Mismatched from');
      }
      if (query.to !== undefined && new Date(query.to).toISOString() !== to.toISOString()) {
        throw new Error('Mismatched to');
      }
      return {
        telemetryId: boundary.id,
        recordedAt,
        range: { from, to },
      };
    } catch {
      throw invalidCursor();
    }
  }

  private context(
    organizationId: string,
    monitoringPointId: string,
    includeLate: boolean,
  ): Readonly<Record<string, unknown>> {
    return {
      endpoint: 'monitoring-point-sensor-series',
      organizationId,
      monitoringPointId,
      includeLate,
      ordering: ORDERING,
    };
  }
}

function parseCanonicalDate(value: unknown): Date {
  if (typeof value !== 'string') throw new Error('Missing date');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error('Invalid date');
  }
  return parsed;
}

function invalidCursor(): BadRequestException {
  return new BadRequestException({
    code: 'INVALID_CURSOR',
    message: 'Cursor tidak valid untuk query ini.',
  });
}
