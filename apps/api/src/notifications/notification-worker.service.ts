import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { PrismaService } from '../database/prisma.service.js';
import { NotificationDeliveryStatus, type NotificationOutbox } from '../generated/prisma/client.js';
import { formatTelegramRiskMessage } from './notification-message.js';
import { parseRiskTransitionPayload } from './notification.types.js';
import { TelegramClientService } from './telegram-client.service.js';

const pollingIntervalMilliseconds = 5_000;
const processingLeaseMilliseconds = 2 * 60_000;
const maximumAttempts = 8;
const maximumBatchSize = 10;

@Injectable()
export class NotificationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramClientService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.telegram.enabled || this.config.nodeEnv === 'test' || this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => void this.drain(), pollingIntervalMilliseconds);
    this.timer.unref();
    void this.drain();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(now = new Date()): Promise<boolean> {
    if (!this.config.telegram.enabled) return false;
    const item = await this.claim(now);
    if (item === null) return false;

    const payload = parseRiskTransitionPayload(item.payload);
    if (payload === null || item.eventType !== 'RISK_STATUS_CHANGED') {
      await this.markFailed(item, {
        code: 'INVALID_NOTIFICATION_PAYLOAD',
        message: 'Notification payload could not be validated.',
      });
      return true;
    }

    const result = await this.telegram.sendMessage(
      formatTelegramRiskMessage(payload, this.config.telegram),
    );
    if (result.delivered) {
      await this.prisma.notificationOutbox.updateMany({
        where: { id: item.id, status: NotificationDeliveryStatus.PROCESSING },
        data: {
          status: NotificationDeliveryStatus.SENT,
          processingStartedAt: null,
          sentAt: new Date(),
          externalMessageId: result.messageId,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      return true;
    }

    if (!result.retryable || item.attemptCount >= maximumAttempts) {
      await this.markFailed(item, result);
      return true;
    }

    const retryAt = new Date(
      now.getTime() +
        (result.retryAfterSeconds === null
          ? retryDelayMilliseconds(item.attemptCount)
          : result.retryAfterSeconds * 1_000),
    );
    await this.prisma.notificationOutbox.updateMany({
      where: { id: item.id, status: NotificationDeliveryStatus.PROCESSING },
      data: {
        status: NotificationDeliveryStatus.PENDING,
        processingStartedAt: null,
        nextAttemptAt: retryAt,
        lastErrorCode: result.code,
        lastErrorMessage: result.message.slice(0, 500),
      },
    });
    return true;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let processed = 0; processed < maximumBatchSize; processed += 1) {
        if (!(await this.runOnce(new Date()))) break;
      }
    } catch (error: unknown) {
      this.logger.error(
        `Telegram notification worker failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async claim(now: Date): Promise<NotificationOutbox | null> {
    const staleBefore = new Date(now.getTime() - processingLeaseMilliseconds);
    return this.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.notificationOutbox.findFirst({
        where: {
          channel: 'TELEGRAM',
          OR: [
            { status: NotificationDeliveryStatus.PENDING, nextAttemptAt: { lte: now } },
            {
              status: NotificationDeliveryStatus.PROCESSING,
              processingStartedAt: { lte: staleBefore },
            },
          ],
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      if (candidate === null) return null;

      const claimed = await transaction.notificationOutbox.updateMany({
        where: {
          id: candidate.id,
          OR: [
            { status: NotificationDeliveryStatus.PENDING, nextAttemptAt: { lte: now } },
            {
              status: NotificationDeliveryStatus.PROCESSING,
              processingStartedAt: { lte: staleBefore },
            },
          ],
        },
        data: {
          status: NotificationDeliveryStatus.PROCESSING,
          processingStartedAt: now,
          attemptCount: { increment: 1 },
        },
      });
      if (claimed.count !== 1) return null;
      return transaction.notificationOutbox.findUnique({ where: { id: candidate.id } });
    });
  }

  private async markFailed(
    item: NotificationOutbox,
    error: { readonly code: string; readonly message: string },
  ): Promise<void> {
    await this.prisma.notificationOutbox.updateMany({
      where: { id: item.id, status: NotificationDeliveryStatus.PROCESSING },
      data: {
        status: NotificationDeliveryStatus.FAILED,
        processingStartedAt: null,
        lastErrorCode: error.code,
        lastErrorMessage: error.message.slice(0, 500),
      },
    });
  }
}

function retryDelayMilliseconds(attemptCount: number): number {
  return Math.min(15_000 * 2 ** Math.max(0, attemptCount - 1), 15 * 60_000);
}
