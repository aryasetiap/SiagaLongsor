import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { RealtimeAuthorizationService } from './realtime-authorization.service.js';
import { RealtimeConnectionRegistry } from './realtime-connection.registry.js';
import { RealtimePostCommitService } from './realtime-post-commit.service.js';
import { RealtimeRedisService } from './realtime-redis.service.js';
import { RealtimeController } from './realtime.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [
    RealtimeAuthorizationService,
    RealtimeConnectionRegistry,
    RealtimePostCommitService,
    RealtimeRedisService,
  ],
  exports: [RealtimeConnectionRegistry, RealtimePostCommitService, RealtimeRedisService],
})
export class RealtimeModule {}
