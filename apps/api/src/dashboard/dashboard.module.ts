import { Module } from '@nestjs/common';

import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { SensorSeriesCursorService } from './sensor-series-cursor.service.js';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, SensorSeriesCursorService, SignedCursorService],
})
export class DashboardModule {}
