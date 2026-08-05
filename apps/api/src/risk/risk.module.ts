import { Module } from '@nestjs/common';

import { ConnectivityEvaluatorService } from '../connectivity/connectivity-evaluator.service.js';
import { ConnectivitySchedulerService } from '../connectivity/connectivity-scheduler.service.js';
import { DistributedLockService } from '../connectivity/distributed-lock.service.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { RiskEvaluationService } from './risk-evaluation.service.js';

@Module({
  imports: [RealtimeModule],
  controllers: [],
  providers: [
    ConnectivityEvaluatorService,
    ConnectivitySchedulerService,
    DistributedLockService,
    RiskEvaluationService,
  ],
  exports: [ConnectivityEvaluatorService, DistributedLockService, RiskEvaluationService],
})
export class RiskModule {}
