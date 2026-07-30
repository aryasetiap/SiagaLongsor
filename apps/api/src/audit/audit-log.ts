import { createHash } from 'node:crypto';

import type { Prisma } from '../generated/prisma/client.js';
import type { AuditRequestContext } from '../common/http/request-context.js';

export const AuthAuditEvent = {
  LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  LOGIN_SUCCEEDED: 'AUTH_LOGIN_SUCCEEDED',
  REFRESH_ROTATED: 'AUTH_REFRESH_ROTATED',
  REFRESH_REJECTED: 'AUTH_REFRESH_REJECTED',
  REFRESH_REUSE_DETECTED: 'AUTH_REFRESH_REUSE_DETECTED',
  LOGOUT: 'AUTH_LOGOUT',
} as const;

export function authAuditData(input: {
  eventType: (typeof AuthAuditEvent)[keyof typeof AuthAuditEvent];
  request: AuditRequestContext;
  actorId?: string | null;
  organizationId?: string | null;
  sessionId?: string | null;
  metadata?: Prisma.InputJsonObject;
}): Prisma.AuditLogUncheckedCreateInput {
  return {
    actorId: input.actorId ?? null,
    organizationId: input.organizationId ?? null,
    eventType: input.eventType,
    entityType: input.sessionId === undefined || input.sessionId === null ? null : 'RefreshSession',
    entityId: input.sessionId ?? null,
    requestId: input.request.requestId,
    ipAddress: input.request.ipAddress,
    userAgent: input.request.userAgent,
    metadata: input.metadata ?? {},
  };
}

export function hashAuditIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
