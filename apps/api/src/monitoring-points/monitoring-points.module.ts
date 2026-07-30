import { Module } from '@nestjs/common';

import { MonitoringPointCursorService } from './monitoring-point-cursor.service.js';
import { MonitoringPointsController } from './monitoring-points.controller.js';
import { MonitoringPointsService } from './monitoring-points.service.js';

@Module({
  controllers: [MonitoringPointsController],
  providers: [MonitoringPointsService, MonitoringPointCursorService],
})
export class MonitoringPointsModule {}
