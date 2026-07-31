import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../config/app-config.js';

export interface CursorBoundary {
  readonly id: string;
  readonly value: string | number | null;
}

interface CursorPayload {
  readonly version: 1;
  readonly binding: string;
  readonly boundary: CursorBoundary;
}

@Injectable()
export class SignedCursorService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  encode(context: Readonly<Record<string, unknown>>, boundary: CursorBoundary): string {
    const payload: CursorPayload = {
      version: 1,
      binding: this.binding(context),
      boundary,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encoded}.${this.signature(encoded)}`;
  }

  decode(cursor: string, context: Readonly<Record<string, unknown>>): CursorBoundary {
    try {
      const [encoded, suppliedSignature, extra] = cursor.split('.');
      if (encoded === undefined || suppliedSignature === undefined || extra !== undefined) {
        throw new Error('Malformed cursor');
      }
      const expected = Buffer.from(this.signature(encoded), 'base64url');
      const supplied = Buffer.from(suppliedSignature, 'base64url');
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        throw new Error('Invalid signature');
      }
      const payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as Partial<CursorPayload>;
      if (
        payload.version !== 1 ||
        payload.binding !== this.binding(context) ||
        typeof payload.boundary?.id !== 'string' ||
        payload.boundary.id.length === 0 ||
        !validValue(payload.boundary.value)
      ) {
        throw new Error('Invalid payload');
      }
      return payload.boundary;
    } catch {
      throw new BadRequestException({
        code: 'INVALID_CURSOR',
        message: 'Cursor tidak valid untuk query ini.',
      });
    }
  }

  private binding(context: Readonly<Record<string, unknown>>): string {
    return createHash('sha256').update(JSON.stringify(context)).digest('hex');
  }

  private signature(encoded: string): string {
    return createHmac('sha256', this.config.auth.accessTokenSecret)
      .update(encoded)
      .digest('base64url');
  }
}

function validValue(value: unknown): value is string | number | null {
  return (
    value === null ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}
