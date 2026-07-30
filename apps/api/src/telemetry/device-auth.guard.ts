import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { DeviceCredentialService } from '../devices/device-credential.service.js';
import { DeviceLifecycleStatus } from '../generated/prisma/enums.js';
import { TelemetryRateLimitService } from './telemetry-rate-limit.service.js';
import type { DeviceAuthenticatedRequest } from './telemetry.types.js';

const DEVICE_AUTHORIZATION_PATTERN = /^Device ([A-Z0-9][A-Z0-9_-]{2,63})\.([A-Za-z0-9_-]{32,256})$/;

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: DeviceCredentialService,
    private readonly rateLimit: TelemetryRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceAuthenticatedRequest>();
    await this.rateLimit.consumeIp(request.ip ?? request.socket.remoteAddress ?? 'unknown');

    const match = DEVICE_AUTHORIZATION_PATTERN.exec(request.get('authorization') ?? '');
    if (match === null) throw invalidCredential();
    const [, hardwareId, secret] = match;
    if (hardwareId === undefined || secret === undefined) throw invalidCredential();

    await this.rateLimit.consumeDevice(hardwareId);
    const device = await this.prisma.device.findUnique({ where: { hardwareId } });
    if (!(await this.credentials.verify(secret, device?.credentialHash)) || device === null) {
      throw invalidCredential();
    }
    if (device.lifecycleStatus === DeviceLifecycleStatus.DISABLED) {
      throw new ForbiddenException({
        code: 'DEVICE_DISABLED',
        message: 'Device dinonaktifkan.',
      });
    }

    request.authenticatedDevice = {
      id: device.id,
      organizationId: device.organizationId,
      siteId: device.siteId,
      monitoringPointId: device.monitoringPointId,
      hardwareId: device.hardwareId,
      lifecycleStatus: device.lifecycleStatus,
      authenticatedCredentialHash: device.credentialHash,
    };
    return true;
  }
}

function invalidCredential(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'DEVICE_CREDENTIAL_INVALID',
    message: 'Credential device tidak valid.',
  });
}
