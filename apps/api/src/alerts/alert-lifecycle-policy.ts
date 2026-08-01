import { createHash } from 'node:crypto';

import { BadRequestException, ConflictException } from '@nestjs/common';

import { AlertStatus } from '../generated/prisma/enums.js';
import type { LifecycleActionType, LifecycleEventType } from './alert-lifecycle.types.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface NormalizedLifecyclePayload {
  readonly actionId: string;
  readonly note?: string;
  readonly fieldCondition?: string;
  readonly sopExecuted?: boolean;
  readonly resolutionNote?: string;
  readonly reason?: string;
}

export interface LifecycleTransition {
  readonly nextStatus: AlertStatus;
  readonly eventType: LifecycleEventType;
}

export function validateIdempotencyHeader(header: string | undefined, actionId: string): void {
  if (header === undefined || !UUID_V4.test(header)) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Idempotency-Key UUID v4 diperlukan.',
    });
  }
  if (header !== actionId) {
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_MISMATCH',
      message: 'Idempotency-Key harus sama dengan actionId.',
    });
  }
}

export function lifecycleTransition(
  actionType: LifecycleActionType,
  currentStatus: AlertStatus,
): LifecycleTransition {
  if (actionType === 'ACKNOWLEDGE' && currentStatus === AlertStatus.ACTIVE) {
    return { nextStatus: AlertStatus.ACKNOWLEDGED, eventType: 'ALERT_ACKNOWLEDGED' };
  }
  if (actionType === 'RESOLVE' && currentStatus === AlertStatus.ACKNOWLEDGED) {
    return { nextStatus: AlertStatus.RESOLVED, eventType: 'ALERT_RESOLVED' };
  }
  if (
    actionType === 'FALSE_ALARM' &&
    (currentStatus === AlertStatus.ACTIVE || currentStatus === AlertStatus.ACKNOWLEDGED)
  ) {
    return { nextStatus: AlertStatus.FALSE_ALARM, eventType: 'ALERT_FALSE_ALARM' };
  }
  throw new ConflictException({
    code: 'ALERT_STATE_CONFLICT',
    message: 'Status Alert tidak mengizinkan aksi ini.',
  });
}

export function normalizeLifecyclePayload(
  actionType: LifecycleActionType,
  input: NormalizedLifecyclePayload,
): NormalizedLifecyclePayload {
  const base = { actionId: input.actionId };
  if (actionType === 'ACKNOWLEDGE') {
    return {
      ...base,
      note: input.note?.trim() ?? '',
      fieldCondition: input.fieldCondition?.trim() ?? '',
      sopExecuted: input.sopExecuted ?? false,
    };
  }
  if (actionType === 'RESOLVE') {
    return { ...base, resolutionNote: input.resolutionNote?.trim() ?? '' };
  }
  return { ...base, reason: input.reason?.trim() ?? '' };
}

export function lifecyclePayloadHash(input: {
  readonly actionType: LifecycleActionType;
  readonly organizationId: string;
  readonly alertId: string;
  readonly payload: NormalizedLifecyclePayload;
}): string {
  const canonical =
    input.actionType === 'ACKNOWLEDGE'
      ? [
          input.actionType,
          input.organizationId,
          input.alertId,
          input.payload.actionId,
          input.payload.note,
          input.payload.fieldCondition,
          input.payload.sopExecuted,
        ]
      : input.actionType === 'RESOLVE'
        ? [
            input.actionType,
            input.organizationId,
            input.alertId,
            input.payload.actionId,
            input.payload.resolutionNote,
          ]
        : [
            input.actionType,
            input.organizationId,
            input.alertId,
            input.payload.actionId,
            input.payload.reason,
          ];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
