import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';

import type { RequestWithContext } from '../common/http/request-context.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

@Injectable()
export class CookieOriginGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.allowedOrigin = new URL(config.webUrl).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const origin = request.get('origin');

    if (origin === undefined || origin === this.allowedOrigin) {
      return true;
    }

    throw new ForbiddenException({
      code: 'ORIGIN_NOT_ALLOWED',
      message: 'Origin request tidak diizinkan.',
    });
  }
}
