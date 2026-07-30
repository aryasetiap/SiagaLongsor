import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '../generated/prisma/enums.js';
import type { RequestWithContext } from '../common/http/request-context.js';
import { REQUIRED_ROLES } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (roles === undefined || roles.length === 0) {
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

    const effectiveRoles =
      request.organizationContext === undefined
        ? principal.memberships.map((membership) => membership.role)
        : [request.organizationContext.role];

    if (!effectiveRoles.some((role) => roles.includes(role))) {
      throw new ForbiddenException({
        code: 'ROLE_ACCESS_DENIED',
        message: 'Role tidak memiliki izin untuk aksi ini.',
      });
    }

    return true;
  }
}
