import { Module } from '@nestjs/common';

import { DevicesModule } from '../devices/devices.module.js';
import { DeviceAuthGuard } from './device-auth.guard.js';
import { JsonContentTypeGuard } from './json-content-type.guard.js';
import { TelemetryController } from './telemetry.controller.js';
import { TelemetryRateLimitService } from './telemetry-rate-limit.service.js';
import { TelemetryService } from './telemetry.service.js';

@Module({
  imports: [DevicesModule],
  controllers: [TelemetryController],
  providers: [TelemetryService, DeviceAuthGuard, JsonContentTypeGuard, TelemetryRateLimitService],
})
export class TelemetryModule {}
