import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { AlertStatus } from '../generated/prisma/enums.js';
import { sanitizeLifecycleMetadata } from './alert-events.service.js';
import {
  lifecyclePayloadHash,
  lifecycleTransition,
  normalizeLifecyclePayload,
  validateIdempotencyHeader,
} from './alert-lifecycle-policy.js';
import { AcknowledgeAlertDto } from './dto/alert-lifecycle.dto.js';
import { validateRange } from '../audit/audit-logs.service.js';

const actionId = '4e998a8c-f59d-4a8f-92b2-d2bde1666235';

describe('Phase 05 alert lifecycle policy', () => {
  it.each([
    ['ACKNOWLEDGE', AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED],
    ['RESOLVE', AlertStatus.ACKNOWLEDGED, AlertStatus.RESOLVED],
    ['FALSE_ALARM', AlertStatus.ACTIVE, AlertStatus.FALSE_ALARM],
    ['FALSE_ALARM', AlertStatus.ACKNOWLEDGED, AlertStatus.FALSE_ALARM],
  ] as const)('allows %s from %s', (actionType, current, expected) => {
    expect(lifecycleTransition(actionType, current).nextStatus).toBe(expected);
  });

  it.each([
    ['ACKNOWLEDGE', AlertStatus.ACKNOWLEDGED],
    ['ACKNOWLEDGE', AlertStatus.RESOLVED],
    ['RESOLVE', AlertStatus.ACTIVE],
    ['RESOLVE', AlertStatus.FALSE_ALARM],
    ['FALSE_ALARM', AlertStatus.RESOLVED],
  ] as const)('rejects %s from %s', (actionType, current) => {
    expect(() => lifecycleTransition(actionType, current)).toThrow(ConflictException);
  });

  it('validates UUID-v4 actionId through the DTO', async () => {
    const dto = plainToInstance(AcknowledgeAlertDto, {
      actionId: 'not-a-uuid',
      note: 'catatan',
      fieldCondition: 'kondisi',
      sopExecuted: true,
    });
    expect(await validate(dto)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'actionId' })]),
    );
  });

  it('requires an equal UUID-v4 idempotency header', () => {
    expect(() => validateIdempotencyHeader(actionId, actionId)).not.toThrow();
    expect(() => validateIdempotencyHeader(undefined, actionId)).toThrow(BadRequestException);
    expect(() =>
      validateIdempotencyHeader('a7da21da-c8cc-4d25-8337-518ef4409e30', actionId),
    ).toThrow(BadRequestException);
  });

  it('normalizes before producing a deterministic canonical payload hash', () => {
    const first = normalizeLifecyclePayload('ACKNOWLEDGE', {
      actionId,
      note: '  diterima ',
      fieldCondition: ' stabil  ',
      sopExecuted: true,
    });
    const second = normalizeLifecyclePayload('ACKNOWLEDGE', {
      actionId,
      note: 'diterima',
      fieldCondition: 'stabil',
      sopExecuted: true,
    });
    const context = { actionType: 'ACKNOWLEDGE' as const, organizationId: 'org', alertId: 'alert' };
    expect(lifecyclePayloadHash({ ...context, payload: first })).toBe(
      lifecyclePayloadHash({ ...context, payload: second }),
    );
    expect(lifecyclePayloadHash({ ...context, payload: second })).toMatch(/^[a-f0-9]{64}$/);
  });

  it('binds the canonical hash to organization, alert, action type, actionId, and fields', () => {
    const payload = { actionId, resolutionNote: 'selesai' };
    const hash = lifecyclePayloadHash({
      actionType: 'RESOLVE',
      organizationId: 'org-a',
      alertId: 'alert-a',
      payload,
    });
    expect(
      lifecyclePayloadHash({
        actionType: 'RESOLVE',
        organizationId: 'org-b',
        alertId: 'alert-a',
        payload,
      }),
    ).not.toBe(hash);
    expect(
      lifecyclePayloadHash({
        actionType: 'RESOLVE',
        organizationId: 'org-a',
        alertId: 'alert-b',
        payload,
      }),
    ).not.toBe(hash);
  });

  it('whitelists lifecycle metadata and drops sensitive or arbitrary fields', () => {
    expect(
      sanitizeLifecycleMetadata('ALERT_ACKNOWLEDGED', {
        actorId: 'user',
        actionId,
        note: 'aman',
        password: 'forbidden',
        ipAddress: '127.0.0.1',
      }),
    ).toEqual({ actorId: 'user', actionId, note: 'aman' });
    expect(sanitizeLifecycleMetadata('OBSERVED', { rawPayload: { private: true } })).toEqual({});
  });

  it('validates increasing audit range capped at 30 days', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    expect(() => validateRange(from, new Date('2026-08-31T00:00:00.000Z'))).not.toThrow();
    expect(() => validateRange(from, from)).toThrow(BadRequestException);
    expect(() => validateRange(from, new Date('2026-08-31T00:00:00.001Z'))).toThrow(
      BadRequestException,
    );
  });
});
