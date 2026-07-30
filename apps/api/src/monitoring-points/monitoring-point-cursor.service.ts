import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import {
  MonitoringPointSort,
  type ListMonitoringPointsQueryDto,
} from './dto/monitoring-point.dto.js';

interface CursorBoundary {
  readonly id: string;
  readonly value: string;
}

interface CursorPayload {
  readonly version: 1;
  readonly binding: string;
  readonly boundary: CursorBoundary;
}

@Injectable()
export class MonitoringPointCursorService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  encode(
    organizationId: string,
    query: ListMonitoringPointsQueryDto,
    boundary: CursorBoundary,
  ): string {
    const payload: CursorPayload = {
      version: 1,
      binding: this.binding(organizationId, query),
      boundary,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encoded}.${this.signature(encoded)}`;
  }

  decode(
    cursor: string,
    organizationId: string,
    query: ListMonitoringPointsQueryDto,
  ): CursorBoundary {
    try {
      const parts = cursor.split('.');
      if (parts.length !== 2) throw new Error('Malformed cursor');
      const [encoded, suppliedSignature] = parts;
      if (encoded === undefined || suppliedSignature === undefined) throw new Error('Missing part');

      const expectedSignature = this.signature(encoded);
      const supplied = Buffer.from(suppliedSignature, 'base64url');
      const expected = Buffer.from(expectedSignature, 'base64url');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        throw new Error('Invalid signature');
      }

      const payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as Partial<CursorPayload>;
      if (
        payload.version !== 1 ||
        payload.binding !== this.binding(organizationId, query) ||
        typeof payload.boundary?.id !== 'string' ||
        payload.boundary.id.length === 0 ||
        typeof payload.boundary.value !== 'string'
      ) {
        throw new Error('Invalid payload');
      }

      if (
        query.sort !== MonitoringPointSort.NAME_ASC &&
        query.sort !== MonitoringPointSort.NAME_DESC
      ) {
        const timestamp = new Date(payload.boundary.value);
        if (
          Number.isNaN(timestamp.getTime()) ||
          timestamp.toISOString() !== payload.boundary.value
        ) {
          throw new Error('Invalid timestamp');
        }
      }

      return payload.boundary;
    } catch {
      throw new BadRequestException({
        code: 'INVALID_CURSOR',
        message: 'Cursor tidak valid untuk query ini.',
      });
    }
  }

  private binding(organizationId: string, query: ListMonitoringPointsQueryDto): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          organizationId,
          siteId: query.siteId ?? null,
          isActive: query.isActive ?? null,
          search: query.search ?? null,
          sort: query.sort,
        }),
      )
      .digest('hex');
  }

  private signature(encoded: string): string {
    return createHmac('sha256', this.config.auth.accessTokenSecret)
      .update(encoded)
      .digest('base64url');
  }
}
