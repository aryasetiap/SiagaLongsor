import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { RequestWithContext } from '../common/http/request-context.js';
import {
  ORGANIZATION_SCOPE,
  type OrganizationScopeMetadata,
} from './organization-scoped.decorator.js';

@Injectable()
export class OrganizationScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const scope = this.reflector.getAllAndOverride<OrganizationScopeMetadata>(ORGANIZATION_SCOPE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (scope === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const principal = request.principal;

    if (principal === undefined) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Autentikasi diperlukan.',
      });
    }

    const organizationId =
      scope.source === 'header' ? request.get(scope.key)?.trim() : request.params[scope.key];

    if (
      scope.source === 'header' &&
      (organizationId === undefined || organizationId.length === 0)
    ) {
      throw new BadRequestException({
        code: 'ORGANIZATION_CONTEXT_REQUIRED',
        message: 'X-Organization-Id diperlukan.',
      });
    }

    const membership = principal.memberships.find(
      (candidate) => candidate.organizationId === organizationId,
    );

    if (membership === undefined) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_ACCESS_DENIED',
        message: 'Akses ke organization ditolak.',
      });
    }

    request.organizationContext = membership;
    return true;
  }
}
