import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service.js';

const releaseScript = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

@Injectable()
export class DistributedLockService {
  constructor(private readonly redis: RedisService) {}

  async runWithLock<T>(
    key: string,
    ttlMilliseconds: number,
    work: () => Promise<T>,
  ): Promise<{ readonly acquired: false } | { readonly acquired: true; readonly value: T }> {
    const token = randomUUID();
    const acquired = await this.redis.client.set(key, token, 'PX', ttlMilliseconds, 'NX');
    if (acquired !== 'OK') return { acquired: false };

    try {
      return { acquired: true, value: await work() };
    } finally {
      await this.release(key, token);
    }
  }

  async release(key: string, token: string): Promise<boolean> {
    const result = await this.redis.client.eval(releaseScript, 1, key, token);
    return result === 1;
  }
}
