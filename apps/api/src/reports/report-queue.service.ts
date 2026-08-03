import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';

import { PrismaService } from '../database/prisma.service.js';
import { ReportJobStatus } from '../generated/prisma/enums.js';
import { RedisService } from '../redis/redis.service.js';
import type { ReportQueue } from './report-queue.js';
import { ReportWorkerService } from './report-worker.service.js';

interface ReportQueueData {
  readonly reportJobId: string;
}

const QUEUE_NAME = 'reports-v1';
const QUEUE_PREFIX = 'siagalongsor';
const ATTEMPTS = 3;

@Injectable()
export class ReportQueueService implements ReportQueue, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportQueueService.name);
  private queueConnection: Redis | null = null;
  private workerConnection: Redis | null = null;
  private queue: Queue<ReportQueueData, void, 'generate'> | null = null;
  private worker: Worker<ReportQueueData, void, 'generate'> | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly processor: ReportWorkerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queueConnection = this.redis.client.duplicate({
      enableOfflineQueue: true,
      lazyConnect: false,
      maxRetriesPerRequest: null,
    });
    this.workerConnection = this.redis.client.duplicate({
      enableOfflineQueue: true,
      lazyConnect: false,
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<ReportQueueData, void, 'generate'>(QUEUE_NAME, {
      connection: this.queueConnection,
      prefix: queuePrefix(),
    });
    this.worker = new Worker<ReportQueueData, void, 'generate'>(
      QUEUE_NAME,
      async (job) => this.processor.process(job.data.reportJobId),
      {
        connection: this.workerConnection,
        concurrency: 2,
        lockDuration: 120_000,
        prefix: queuePrefix(),
        stalledInterval: 30_000,
      },
    );
    this.worker.on('failed', (job, error) => {
      void this.handleExhaustedFailure(job, error);
    });
    this.worker.on('error', () => {
      this.logger.error('Report worker connection or processing error.');
    });
    if (process.env.NODE_ENV !== 'test') await this.recoverQueuedJobs();
  }

  async enqueue(reportJobId: string): Promise<void> {
    if (this.queue === null) throw new Error('Report queue is not initialized.');
    await this.queue.add(
      'generate',
      { reportJobId },
      {
        jobId: reportJobId,
        attempts: ATTEMPTS,
        backoff: { type: 'exponential', delay: 500 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await closeConnection(this.workerConnection);
    await closeConnection(this.queueConnection);
  }

  private async recoverQueuedJobs(): Promise<void> {
    let cursor: string | undefined;
    while (true) {
      const rows = await this.prisma.reportJob.findMany({
        where: { status: ReportJobStatus.QUEUED },
        select: { id: true },
        orderBy: { id: 'asc' },
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
        take: 100,
      });
      for (const row of rows) await this.enqueue(row.id);
      const last = rows.at(-1);
      if (last === undefined || rows.length < 100) return;
      cursor = last.id;
    }
  }

  private async handleExhaustedFailure(
    job: Job<ReportQueueData, void, 'generate'> | undefined,
    error: Error,
  ): Promise<void> {
    if (job === undefined) return;
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) return;
    try {
      await this.processor.failAfterExhaustion(job.data.reportJobId, error);
    } catch {
      this.logger.error('Unable to persist exhausted report job failure state.');
    }
  }
}

function queuePrefix(): string {
  return process.env.NODE_ENV === 'test' ? `${QUEUE_PREFIX}-test-${process.pid}` : QUEUE_PREFIX;
}

async function closeConnection(connection: Redis | null): Promise<void> {
  if (connection !== null && connection.status !== 'end') await connection.quit();
}
