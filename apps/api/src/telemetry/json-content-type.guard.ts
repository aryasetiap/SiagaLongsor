import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import type { DeviceAuthenticatedRequest } from './telemetry.types.js';

@Injectable()
export class JsonContentTypeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<DeviceAuthenticatedRequest>();
    if (request.is('application/json') !== 'application/json') {
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content-Type application/json diperlukan.',
      });
    }
    return true;
  }
}
