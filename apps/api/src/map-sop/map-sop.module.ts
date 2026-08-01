import { Module } from '@nestjs/common';

import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import { ObjectStorageModule } from '../object-storage/object-storage.module.js';
import { MapConfigurationService } from './map-configuration.service.js';
import { MapSopController } from './map-sop.controller.js';
import { SopService } from './sop.service.js';

@Module({
  imports: [ObjectStorageModule],
  controllers: [MapSopController],
  providers: [MapConfigurationService, SopService, SignedCursorService],
})
export class MapSopModule {}
