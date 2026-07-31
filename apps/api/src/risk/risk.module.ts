import { Module } from '@nestjs/common';

import { AlertObservationService } from '../alerts/alert-observation.service.js';
import { AlertsController } from '../alerts/alerts.controller.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import { ConnectivityEvaluatorService } from '../connectivity/connectivity-evaluator.service.js';
import { ConnectivitySchedulerService } from '../connectivity/connectivity-scheduler.service.js';
import { DistributedLockService } from '../connectivity/distributed-lock.service.js';
import { RiskEvaluationService } from './risk-evaluation.service.js';
import { RiskReadController } from './risk-read.controller.js';
import { RiskReadService } from './risk-read.service.js';

@Module({
  controllers: [RiskReadController, AlertsController],
  providers: [
    AlertObservationService,
    AlertsService,
    ConnectivityEvaluatorService,
    ConnectivitySchedulerService,
    DistributedLockService,
    RiskEvaluationService,
    RiskReadService,
    SignedCursorService,
  ],
  exports: [
    AlertObservationService,
    ConnectivityEvaluatorService,
    DistributedLockService,
    RiskEvaluationService,
  ],
})
export class RiskModule {}
