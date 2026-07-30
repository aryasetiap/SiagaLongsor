import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<{ database: boolean; redis: boolean }> {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.client
        .ping()
        .then((response) => response === 'PONG')
        .catch(() => false),
    ]);

    return { database, redis };
  }
}
