import { Injectable, Logger } from '@nestjs/common';

import { RealtimeRedisService } from './realtime-redis.service.js';
import type { RealtimeDescriptor } from './realtime.types.js';

@Injectable()
export class RealtimePostCommitService {
  private readonly logger = new Logger(RealtimePostCommitService.name);

  constructor(private readonly realtime: RealtimeRedisService) {}

  async dispatch(descriptors: readonly RealtimeDescriptor[]): Promise<void> {
    for (const descriptor of descriptors) {
      try {
        await this.realtime.publish(descriptor);
      } catch {
        this.logger.warn('Realtime publication failed after database commit.');
      }
    }
  }
}
