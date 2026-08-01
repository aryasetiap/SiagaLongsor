import { Injectable } from '@nestjs/common';

import type { AlertLifecycleCommittedEvent } from './alert-lifecycle.types.js';
import { RealtimePostCommitService } from '../realtime/realtime-post-commit.service.js';

@Injectable()
export class AlertLifecyclePostCommit {
  constructor(private readonly realtime: RealtimePostCommitService) {}

  dispatch(event: AlertLifecycleCommittedEvent): Promise<void> {
    return this.realtime.dispatch([
      {
        ...event,
        siteId: event.siteId,
        monitoringPointId: event.monitoringPointId,
        alertId: event.alertId,
      },
    ]);
  }
}
