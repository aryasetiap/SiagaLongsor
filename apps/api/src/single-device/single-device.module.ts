import { Module } from '@nestjs/common';

import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import { SingleDeviceController } from './single-device.controller.js';
import { SingleDeviceService } from './single-device.service.js';

@Module({
  controllers: [SingleDeviceController],
  providers: [SingleDeviceService, SignedCursorService],
})
export class SingleDeviceModule {}
