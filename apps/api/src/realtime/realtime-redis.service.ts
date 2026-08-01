import { randomUUID } from 'node:crypto';

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { RedisService } from '../redis/redis.service.js';
import { parseInternalRealtimeMessage } from './realtime-message.js';
import { RealtimeConnectionRegistry } from './realtime-connection.registry.js';
import type { InternalRealtimeMessage, RealtimeDescriptor } from './realtime.types.js';

export const REALTIME_REDIS_CHANNEL = 'siagalongsor:realtime:v1';

@Injectable()
export class RealtimeRedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeRedisService.name);
  private readonly subscriber: Redis;
  private readonly messageListener: (channel: string, message: string) => void;

  constructor(
    private readonly redis: RedisService,
    private readonly registry: RealtimeConnectionRegistry,
  ) {
    this.subscriber = this.redis.client.duplicate({
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: null,
    });
    this.subscriber.on('error', () => {
      this.logger.warn('Realtime Redis subscriber connection error.');
    });
    this.messageListener = (channel, raw) => {
      if (channel !== REALTIME_REDIS_CHANNEL) return;
      const message = parseInternalRealtimeMessage(raw);
      if (message === null) {
        this.logger.warn('Ignored malformed or unsupported realtime Redis message.');
        return;
      }
      this.registry.deliver(message);
    };
  }

  async onModuleInit(): Promise<void> {
    this.subscriber.on('message', this.messageListener);
    await this.subscriber.connect();
    await this.subscriber.subscribe(REALTIME_REDIS_CHANNEL);
  }

  async publish(descriptor: RealtimeDescriptor): Promise<InternalRealtimeMessage> {
    const message: InternalRealtimeMessage = {
      version: 1,
      eventId: randomUUID(),
      ...descriptor,
    };
    await this.redis.client.publish(REALTIME_REDIS_CHANNEL, JSON.stringify(message));
    return message;
  }

  async onModuleDestroy(): Promise<void> {
    this.subscriber.off('message', this.messageListener);
    if (this.subscriber.status !== 'end') {
      if (this.subscriber.status === 'ready') {
        await this.subscriber.unsubscribe(REALTIME_REDIS_CHANNEL);
      }
      await this.subscriber.quit();
    }
  }
}
