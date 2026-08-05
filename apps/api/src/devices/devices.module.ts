import { Module } from '@nestjs/common';

import { DeviceCredentialService } from './device-credential.service.js';
import { DeviceCursorService } from './device-cursor.service.js';
import { DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';

@Module({
  imports: [],
  controllers: [DevicesController],
  providers: [DevicesService, DeviceCredentialService, DeviceCursorService],
  exports: [DeviceCredentialService],
})
export class DevicesModule {}
