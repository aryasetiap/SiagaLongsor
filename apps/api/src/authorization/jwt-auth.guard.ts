import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthService } from '../auth/auth.service.js';
import type { RequestWithContext } from '../common/http/request-context.js';
import { IS_PUBLIC } from './public.decorator.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const authorization = request.get('authorization');

    if (authorization === undefined || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'ACCESS_TOKEN_REQUIRED',
        message: 'Access token diperlukan.',
      });
    }

    const token = authorization.slice('Bearer '.length).trim();
    request.principal = await this.authService.authenticateAccessToken(token);
    return true;
  }
}
