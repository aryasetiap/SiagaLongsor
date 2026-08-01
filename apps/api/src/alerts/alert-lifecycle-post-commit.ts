import { Injectable } from '@nestjs/common';

import type { AlertLifecycleCommittedEvent } from './alert-lifecycle.types.js';

@Injectable()
export class AlertLifecyclePostCommit {
  dispatch(event: AlertLifecycleCommittedEvent): Promise<void> {
    void event;
    return Promise.resolve();
  }
}
