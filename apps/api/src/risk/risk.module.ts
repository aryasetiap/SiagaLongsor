import { Module } from '@nestjs/common';

import { AlertObservationService } from '../alerts/alert-observation.service.js';
import { AlertEventsService } from '../alerts/alert-events.service.js';
import { AlertLifecyclePostCommit } from '../alerts/alert-lifecycle-post-commit.js';
import { AlertLifecycleService } from '../alerts/alert-lifecycle.service.js';
import { AlertsController } from '../alerts/alerts.controller.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { AuditLogsController } from '../audit/audit-logs.controller.js';
import { AuditLogsService } from '../audit/audit-logs.service.js';
import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import { ConnectivityEvaluatorService } from '../connectivity/connectivity-evaluator.service.js';
import { ConnectivitySchedulerService } from '../connectivity/connectivity-scheduler.service.js';
import { DistributedLockService } from '../connectivity/distributed-lock.service.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { RiskEvaluationService } from './risk-evaluation.service.js';
import { RiskReadController } from './risk-read.controller.js';
import { RiskReadService } from './risk-read.service.js';

@Module({
  imports: [RealtimeModule],
  controllers: [RiskReadController, AlertsController, AuditLogsController],
  providers: [
    AlertObservationService,
    AlertEventsService,
    AlertLifecyclePostCommit,
    AlertLifecycleService,
    AlertsService,
    AuditLogsService,
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
