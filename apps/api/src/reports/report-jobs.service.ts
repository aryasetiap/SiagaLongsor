import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import type {
  AuthenticatedPrincipal,
  OrganizationContext,
} from '../authorization/authorization.types.js';
import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import type { AuditRequestContext } from '../common/http/request-context.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma, ReportFailureCode, ReportJobStatus } from '../generated/prisma/client.js';
import { OBJECT_STORAGE, type ObjectStorageService } from '../object-storage/object-storage.js';
import type { CreateReportJobDto, ReportJobListQueryDto } from './dto/reports.dto.js';
import { REPORT_QUEUE, type ReportQueue } from './report-queue.js';
import { parseReportRange } from './report-range.js';
import type { ReportJobData, ReportJobListResponse, ReportJobResponse } from './reports.types.js';

const reportInclude = {
  site: { select: { id: true, name: true, timezone: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ReportJobInclude;

type ReportJobRow = Prisma.ReportJobGetPayload<{ include: typeof reportInclude }>;

@Injectable()
export class ReportJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursors: SignedCursorService,
    @Inject(REPORT_QUEUE) private readonly queue: ReportQueue,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageService,
  ) {}

  async create(
    organization: OrganizationContext,
    principal: AuthenticatedPrincipal,
    input: CreateReportJobDto,
    request: AuditRequestContext,
  ): Promise<ReportJobResponse> {
    const range = parseReportRange(input.from, input.to);
    const job = await this.prisma.$transaction(async (transaction) => {
      const site = await transaction.site.findFirst({
        where: { id: input.siteId, organizationId: organization.organizationId },
        select: { id: true },
      });
      if (site === null) throw siteNotFound();
      const created = await transaction.reportJob.create({
        data: {
          organizationId: organization.organizationId,
          siteId: site.id,
          reportType: input.reportType,
          from: range.from,
          to: range.to,
          createdById: principal.userId,
        },
        include: reportInclude,
      });
      await transaction.auditLog.create({
        data: {
          organizationId: organization.organizationId,
          actorId: principal.userId,
          eventType: 'REPORT_JOB_CREATED',
          entityType: 'ReportJob',
          entityId: created.id,
          requestId: request.requestId,
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
          metadata: {
            reportJobId: created.id,
            reportType: input.reportType,
            siteId: site.id,
            from: range.from.toISOString(),
            to: range.to.toISOString(),
          },
        },
      });
      return created;
    });
    try {
      await this.queue.enqueue(job.id);
    } catch {
      await this.prisma.reportJob.updateMany({
        where: { id: job.id, status: ReportJobStatus.QUEUED },
        data: {
          status: ReportJobStatus.FAILED,
          completedAt: new Date(),
          failureCode: ReportFailureCode.REPORT_GENERATION_FAILED,
          failureMessage: 'Laporan tidak dapat dimasukkan ke antrean pemrosesan.',
        },
      });
      throw new InternalServerErrorException();
    }
    return { data: toReportJobData(job) };
  }

  async list(organizationId: string, query: ReportJobListQueryDto): Promise<ReportJobListResponse> {
    await this.expireDueJobs(organizationId);
    if (query.siteId !== undefined) await this.requireSite(organizationId, query.siteId);
    const context = {
      endpoint: 'report-jobs',
      organizationId,
      siteId: query.siteId ?? null,
      status: query.status ?? null,
      reportType: query.reportType ?? null,
    };
    const boundary = query.cursor === undefined ? null : this.cursors.decode(query.cursor, context);
    const rows = await this.prisma.reportJob.findMany({
      where: {
        organizationId,
        ...(query.siteId === undefined ? {} : { siteId: query.siteId }),
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.reportType === undefined ? {} : { reportType: query.reportType }),
        ...(boundary === null
          ? {}
          : {
              OR: [
                { requestedAt: { lt: new Date(String(boundary.value)) } },
                { requestedAt: new Date(String(boundary.value)), id: { lt: boundary.id } },
              ],
            }),
      },
      include: reportInclude,
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows.at(-1);
    return {
      data: pageRows.map(toReportJobData),
      page: {
        hasMore,
        nextCursor:
          hasMore && last !== undefined
            ? this.cursors.encode(context, { id: last.id, value: last.requestedAt.toISOString() })
            : null,
      },
    };
  }

  async get(organizationId: string, reportJobId: string): Promise<ReportJobResponse> {
    await this.expireDueJobs(organizationId, reportJobId);
    const row = await this.find(organizationId, reportJobId);
    return { data: toReportJobData(row) };
  }

  async content(
    organizationId: string,
    reportJobId: string,
  ): Promise<{ readonly body: Buffer; readonly fileName: string }> {
    await this.expireDueJobs(organizationId, reportJobId);
    const row = await this.find(organizationId, reportJobId);
    if (row.status === ReportJobStatus.EXPIRED) throw artifactUnavailable();
    if (row.status !== ReportJobStatus.SUCCEEDED) {
      throw new ConflictException({
        code: 'REPORT_NOT_READY',
        message: 'Laporan belum tersedia untuk diunduh.',
      });
    }
    if (row.artifactObjectKey === null || row.artifactFileName === null)
      throw artifactUnavailable();
    let stored;
    try {
      stored = await this.storage.get(row.artifactObjectKey);
    } catch {
      throw artifactUnavailable();
    }
    if (stored === null) throw artifactUnavailable();
    return { body: stored.body, fileName: row.artifactFileName };
  }

  private async find(organizationId: string, reportJobId: string): Promise<ReportJobRow> {
    const row = await this.prisma.reportJob.findFirst({
      where: { id: reportJobId, organizationId },
      include: reportInclude,
    });
    if (row === null) throw reportJobNotFound();
    return row;
  }

  private async expireDueJobs(organizationId: string, reportJobId?: string): Promise<void> {
    await this.prisma.reportJob.updateMany({
      where: {
        organizationId,
        ...(reportJobId === undefined ? {} : { id: reportJobId }),
        status: ReportJobStatus.SUCCEEDED,
        expiresAt: { lte: new Date() },
      },
      data: { status: ReportJobStatus.EXPIRED },
    });
  }

  private async requireSite(organizationId: string, siteId: string): Promise<void> {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId },
      select: { id: true },
    });
    if (site === null) throw siteNotFound();
  }
}

function toReportJobData(row: ReportJobRow): ReportJobData {
  const artifact =
    row.artifactFileName !== null &&
    row.artifactMediaType === 'application/pdf' &&
    row.artifactSizeBytes !== null &&
    row.artifactSha256 !== null &&
    row.artifactGeneratedAt !== null &&
    row.expiresAt !== null
      ? {
          fileName: row.artifactFileName,
          mediaType: 'application/pdf' as const,
          sizeBytes: row.artifactSizeBytes,
          sha256: row.artifactSha256,
          generatedAt: row.artifactGeneratedAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        }
      : null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    site: row.site,
    reportType: row.reportType,
    from: row.from.toISOString(),
    to: row.to.toISOString(),
    status: row.status,
    createdBy: row.createdBy,
    requestedAt: row.requestedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    artifact,
  };
}

function siteNotFound(): NotFoundException {
  return new NotFoundException({ code: 'SITE_NOT_FOUND', message: 'Site tidak ditemukan.' });
}

function reportJobNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'REPORT_JOB_NOT_FOUND',
    message: 'Pekerjaan laporan tidak ditemukan.',
  });
}

function artifactUnavailable(): GoneException {
  return new GoneException({
    code: 'REPORT_ARTIFACT_UNAVAILABLE',
    message: 'Artefak laporan tidak tersedia.',
  });
}
