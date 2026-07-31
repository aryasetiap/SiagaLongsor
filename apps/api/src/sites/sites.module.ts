import { Module } from '@nestjs/common';

import { SiteCursorService } from './site-cursor.service.js';
import { SitesController } from './sites.controller.js';
import { SitesService } from './sites.service.js';

@Module({
  controllers: [SitesController],
  providers: [SitesService, SiteCursorService],
})
export class SitesModule {}
