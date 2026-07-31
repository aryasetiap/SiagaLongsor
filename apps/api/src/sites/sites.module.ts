import { Module } from '@nestjs/common';

import { RiskProfileService } from '../risk/risk-profile.service.js';
import { SiteCursorService } from './site-cursor.service.js';
import { SitesController } from './sites.controller.js';
import { SitesService } from './sites.service.js';

@Module({
  controllers: [SitesController],
  providers: [SitesService, SiteCursorService, RiskProfileService],
})
export class SitesModule {}
