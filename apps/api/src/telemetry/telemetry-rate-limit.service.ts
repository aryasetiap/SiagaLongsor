import { createHash } from 'node:crypto';

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { RedisService } from '../redis/redis.service.js';

const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

@Injectable()
export class TelemetryRateLimitService {
  constructor(
    private readonly redis: RedisService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async consumeIp(ipAddress: string): Promise<void> {
    await this.consume(`ip:${digest(ipAddress)}`, this.config.telemetry.rateLimitMax * 5);
  }

  async consumeDevice(hardwareId: string): Promise<void> {
    await this.consume(`device:${digest(hardwareId)}`, this.config.telemetry.rateLimitMax);
  }

  private async consume(subject: string, limit: number): Promise<void> {
    let count: number;
    try {
      const result = await this.redis.client.eval(
        FIXED_WINDOW_SCRIPT,
        1,
        `siagalongsor:telemetry-rate:${this.config.telemetry.rateLimitTtlMs}:${limit}:${subject}`,
        this.config.telemetry.rateLimitTtlMs,
      );
      count = Number(result);
      if (!Number.isInteger(count)) throw new Error('Invalid Redis rate-limit result');
    } catch {
      throw new InternalServerErrorException({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Layanan ingestion sementara tidak tersedia.',
      });
    }

    if (count > limit) {
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Batas permintaan telemetry terlampaui.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
