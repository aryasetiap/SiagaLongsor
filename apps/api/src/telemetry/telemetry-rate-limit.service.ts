import { createHash } from 'node:crypto';

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
const maximumTrackedSubjects = 20_000;

interface FixedWindow {
  count: number;
  expiresAt: number;
}

@Injectable()
export class TelemetryRateLimitService {
  private readonly windows = new Map<string, FixedWindow>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async consumeIp(ipAddress: string): Promise<void> {
    await this.consume(`ip:${digest(ipAddress)}`, this.config.telemetry.rateLimitMax * 5);
  }

  async consumeDevice(hardwareId: string): Promise<void> {
    await this.consume(`device:${digest(hardwareId)}`, this.config.telemetry.rateLimitMax);
  }

  private async consume(subject: string, limit: number): Promise<void> {
    const now = Date.now();
    const key = `${this.config.telemetry.rateLimitTtlMs}:${limit}:${subject}`;
    const current = this.windows.get(key);
    const window =
      current === undefined || current.expiresAt <= now
        ? { count: 1, expiresAt: now + this.config.telemetry.rateLimitTtlMs }
        : { count: current.count + 1, expiresAt: current.expiresAt };
    this.windows.set(key, window);

    if (this.windows.size > maximumTrackedSubjects) {
      this.pruneExpired(now);
    }
    if (this.windows.size > maximumTrackedSubjects) {
      throw new InternalServerErrorException({
        code: 'RATE_LIMIT_CAPACITY_EXCEEDED',
        message: 'Layanan ingestion sementara tidak tersedia.',
      });
    }

    if (window.count > limit) {
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Batas permintaan telemetry terlampaui.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private pruneExpired(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.expiresAt <= now) this.windows.delete(key);
    }
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
