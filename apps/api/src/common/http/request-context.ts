import type { Request } from 'express';

import type {
  AuthenticatedPrincipal,
  OrganizationContext,
} from '../../authorization/authorization.types.js';

export interface RequestWithContext extends Request {
  requestId: string;
  principal?: AuthenticatedPrincipal;
  organizationContext?: OrganizationContext;
}

export interface AuditRequestContext {
  readonly requestId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export function getAuditRequestContext(request: RequestWithContext): AuditRequestContext {
  return {
    requestId: request.requestId,
    ipAddress: truncate(request.ip ?? request.socket.remoteAddress ?? null, 64),
    userAgent: truncate(request.get('user-agent') ?? null, 512),
  };
}

function truncate(value: string | null, maximumLength: number): string | null {
  return value === null ? null : value.slice(0, maximumLength);
}
