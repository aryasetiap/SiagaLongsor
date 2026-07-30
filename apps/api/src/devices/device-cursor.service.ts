import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { DeviceSort, type ListDevicesQueryDto } from './dto/device.dto.js';

export interface DeviceCursorBoundary {
  readonly id: string;
  readonly value: string | null;
}

interface DeviceCursorPayload {
  readonly version: 1;
  readonly binding: string;
  readonly boundary: DeviceCursorBoundary;
}

@Injectable()
export class DeviceCursorService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  encode(
    organizationId: string,
    query: ListDevicesQueryDto,
    boundary: DeviceCursorBoundary,
  ): string {
    const payload: DeviceCursorPayload = {
      version: 1,
      binding: this.binding(organizationId, query),
      boundary,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encoded}.${this.signature(encoded)}`;
  }

  decode(cursor: string, organizationId: string, query: ListDevicesQueryDto): DeviceCursorBoundary {
    try {
      const parts = cursor.split('.');
      if (parts.length !== 2) throw new Error('Malformed cursor');
      const [encoded, suppliedSignature] = parts;
      if (encoded === undefined || suppliedSignature === undefined) throw new Error('Missing part');

      const supplied = Buffer.from(suppliedSignature, 'base64url');
      const expected = Buffer.from(this.signature(encoded), 'base64url');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        throw new Error('Invalid signature');
      }

      const payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as Partial<DeviceCursorPayload>;
      if (
        payload.version !== 1 ||
        payload.binding !== this.binding(organizationId, query) ||
        typeof payload.boundary?.id !== 'string' ||
        payload.boundary.id.length === 0 ||
        (payload.boundary.value !== null && typeof payload.boundary.value !== 'string')
      ) {
        throw new Error('Invalid payload');
      }

      const stringSort =
        query.sort === DeviceSort.DISPLAY_NAME_ASC || query.sort === DeviceSort.DISPLAY_NAME_DESC;
      if (!stringSort && payload.boundary.value !== null) {
        const timestamp = new Date(payload.boundary.value);
        if (
          Number.isNaN(timestamp.getTime()) ||
          timestamp.toISOString() !== payload.boundary.value
        ) {
          throw new Error('Invalid timestamp');
        }
      }
      if (query.sort !== DeviceSort.LAST_SEEN_AT_DESC && payload.boundary.value === null) {
        throw new Error('Unexpected null boundary');
      }

      return payload.boundary;
    } catch {
      throw new BadRequestException({
        code: 'INVALID_CURSOR',
        message: 'Cursor tidak valid untuk query ini.',
      });
    }
  }

  private binding(organizationId: string, query: ListDevicesQueryDto): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          organizationId,
          siteId: query.siteId ?? null,
          monitoringPointId: query.monitoringPointId ?? null,
          lifecycleStatus: query.lifecycleStatus ?? null,
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
