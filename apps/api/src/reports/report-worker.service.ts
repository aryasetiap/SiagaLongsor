import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { ReportFailureCode, ReportJobStatus } from '../generated/prisma/enums.js';
import { OBJECT_STORAGE, type ObjectStorageService } from '../object-storage/object-storage.js';
import { ReportPdfDataService } from './report-pdf-data.service.js';
import { generateSitePeriodSummaryPdf } from './report-pdf.js';
import {
  failureCodeOf,
  reportExpiresAt,
  ReportProcessingError,
  sanitizedFailure,
} from './report-policy.js';

const PROCESSING_LEASE_MS = 90_000;

@Injectable()
export class ReportWorkerService {
  private readonly logger = new Logger(ReportWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly data: ReportPdfDataService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageService,
  ) {}

  async process(reportJobId: string): Promise<void> {
    const authoritative = await this.prisma.reportJob.findUnique({
      where: { id: reportJobId },
      select: { status: true, startedAt: true },
    });
    if (
      authoritative === null ||
      authoritative.status === ReportJobStatus.SUCCEEDED ||
      authoritative.status === ReportJobStatus.EXPIRED ||
      authoritative.status === ReportJobStatus.FAILED
    ) {
      return;
    }

    const token = randomUUID();
    const now = new Date();
    const claimed = await this.prisma.reportJob.updateMany({
      where: {
        id: reportJobId,
        status: { in: [ReportJobStatus.QUEUED, ReportJobStatus.PROCESSING] },
        OR: [
          { processingToken: null },
          { processingLeaseUntil: null },
          { processingLeaseUntil: { lte: now } },
        ],
      },
      data: {
        status: ReportJobStatus.PROCESSING,
        processingToken: token,
        processingLeaseUntil: new Date(now.getTime() + PROCESSING_LEASE_MS),
        startedAt: authoritative.startedAt ?? now,
        failureCode: null,
        failureMessage: null,
      },
    });
    if (claimed.count !== 1) return;

    try {
      const job = await this.prisma.reportJob.findFirstOrThrow({
        where: { id: reportJobId, processingToken: token },
        include: {
          site: { select: { name: true, timezone: true } },
          createdBy: { select: { name: true } },
        },
      });
      const generatedAt = new Date();
      let bytes: Buffer;
      try {
        bytes = await generateSitePeriodSummaryPdf(await this.data.load(job, generatedAt));
      } catch {
        throw new ReportProcessingError(ReportFailureCode.REPORT_GENERATION_FAILED);
      }
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const objectKey = deterministicObjectKey(reportJobId);
      try {
        await this.storage.put({
          key: objectKey,
          body: bytes,
          contentType: 'application/pdf',
          sha256,
        });
      } catch {
        throw new ReportProcessingError(ReportFailureCode.REPORT_ARTIFACT_UNAVAILABLE);
      }
      const fileName = reportPdfFilename(job.site.name, job.from, job.to);
      const expiresAt = reportExpiresAt(generatedAt);
      try {
        const completed = await this.prisma.reportJob.updateMany({
          where: { id: reportJobId, status: ReportJobStatus.PROCESSING, processingToken: token },
          data: {
            status: ReportJobStatus.SUCCEEDED,
            completedAt: generatedAt,
            expiresAt,
            artifactFileName: fileName,
            artifactMediaType: 'application/pdf',
            artifactSizeBytes: bytes.length,
            artifactSha256: sha256,
            artifactObjectKey: objectKey,
            artifactGeneratedAt: generatedAt,
            processingToken: null,
            processingLeaseUntil: null,
          },
        });
        if (completed.count !== 1) {
          throw new ReportProcessingError(ReportFailureCode.REPORT_GENERATION_FAILED);
        }
      } catch (error) {
        await this.compensate(objectKey, reportJobId);
        throw error;
      }
    } catch (error) {
      await this.releaseLease(reportJobId, token);
      throw error instanceof ReportProcessingError
        ? error
        : new ReportProcessingError(ReportFailureCode.REPORT_GENERATION_FAILED);
    }
  }

  async failAfterExhaustion(reportJobId: string, error: Error): Promise<void> {
    const code = failureCodeOf(error);
    await this.prisma.reportJob.updateMany({
      where: {
        id: reportJobId,
        status: { in: [ReportJobStatus.QUEUED, ReportJobStatus.PROCESSING] },
      },
      data: {
        status: ReportJobStatus.FAILED,
        completedAt: new Date(),
        failureCode: code,
        failureMessage: sanitizedFailure(code),
        processingToken: null,
        processingLeaseUntil: null,
      },
    });
  }

  private async releaseLease(reportJobId: string, token: string): Promise<void> {
    await this.prisma.reportJob.updateMany({
      where: { id: reportJobId, status: ReportJobStatus.PROCESSING, processingToken: token },
      data: { processingToken: null, processingLeaseUntil: null },
    });
  }

  private async compensate(objectKey: string, reportJobId: string): Promise<void> {
    try {
      await this.storage.delete(objectKey);
    } catch {
      this.logger.error(`Report artifact compensation failed reportJobId=${reportJobId}.`);
    }
  }
}

export function deterministicObjectKey(reportJobId: string): string {
  return `reports/${createHash('sha256').update(`site-period-report:${reportJobId}`).digest('hex')}.pdf`;
}

export function reportPdfFilename(siteName: string, from: Date, to: Date): string {
  const site =
    siteName
      .normalize('NFKD')
      .replaceAll(/[^A-Za-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '')
      .slice(0, 80)
      .toLowerCase() || 'site';
  return `laporan-${site}-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.pdf`;
}
