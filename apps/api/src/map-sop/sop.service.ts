import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';
import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import type { AuditRequestContext } from '../common/http/request-context.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { OBJECT_STORAGE, type ObjectStorageService } from '../object-storage/object-storage.js';
import type { ListSopVersionsQueryDto, UploadedPdfFile, UploadSopDto } from './dto/map-sop.dto.js';
import type {
  SopDocumentData,
  SopDocumentListResponse,
  SopDocumentResponse,
} from './map-sop.types.js';
import { preparePdfUpload, safeContentDisposition } from './sop-file.validation.js';

const documentInclude = {
  uploadedBy: { select: { id: true, name: true } },
} satisfies Prisma.SopDocumentVersionInclude;

type DocumentRow = Prisma.SopDocumentVersionGetPayload<{ include: typeof documentInclude }>;

@Injectable()
export class SopService {
  private readonly logger = new Logger(SopService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cursors: SignedCursorService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageService,
  ) {}

  async active(organizationId: string, siteId: string): Promise<SopDocumentResponse> {
    await this.requireSite(organizationId, siteId);
    const active = await this.prisma.activeSiteSopDocument.findFirst({
      where: { organizationId, siteId },
      include: { document: { include: documentInclude } },
    });
    if (active === null) throw sopNotFound();
    return { data: toDocumentData(active.document, true) };
  }

  async versions(
    organizationId: string,
    siteId: string,
    query: ListSopVersionsQueryDto,
  ): Promise<SopDocumentListResponse> {
    await this.requireSite(organizationId, siteId);
    const context = { endpoint: 'sop-versions', organizationId, siteId };
    const boundary = query.cursor === undefined ? null : this.cursors.decode(query.cursor, context);
    const [active, rows] = await Promise.all([
      this.prisma.activeSiteSopDocument.findFirst({
        where: { organizationId, siteId },
        select: { documentId: true },
      }),
      this.prisma.sopDocumentVersion.findMany({
        where: {
          organizationId,
          siteId,
          ...(boundary === null
            ? {}
            : {
                OR: [
                  { uploadedAt: { lt: new Date(String(boundary.value)) } },
                  { uploadedAt: new Date(String(boundary.value)), id: { lt: boundary.id } },
                ],
              }),
        },
        include: documentInclude,
        orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      }),
    ]);
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows.at(-1);
    return {
      data: pageRows.map((row) => toDocumentData(row, row.id === active?.documentId)),
      page: {
        hasMore,
        nextCursor:
          hasMore && last !== undefined
            ? this.cursors.encode(context, { id: last.id, value: last.uploadedAt.toISOString() })
            : null,
      },
    };
  }

  async upload(
    organizationId: string,
    siteId: string,
    input: UploadSopDto,
    file: UploadedPdfFile | undefined,
    principal: AuthenticatedPrincipal,
    request: AuditRequestContext,
  ): Promise<SopDocumentResponse> {
    const prepared = preparePdfUpload(file);
    await this.requireSite(organizationId, siteId);
    await this.storage.put({
      key: prepared.objectKey,
      body: prepared.bytes,
      contentType: prepared.mediaType,
      sha256: prepared.sha256,
    });

    try {
      const document = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`phase06-sop:${siteId}`}, 0))::text`,
        );
        const site = await transaction.site.findFirst({
          where: { id: siteId, organizationId },
          select: { id: true },
        });
        if (site === null) throw siteNotFound();
        const latest = await transaction.sopDocumentVersion.findFirst({
          where: { siteId, organizationId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const version = (latest?.version ?? 0) + 1;
        const created = await transaction.sopDocumentVersion.create({
          data: {
            organizationId,
            siteId,
            version,
            title: input.title,
            description: input.description ?? null,
            originalFileName: prepared.originalFileName,
            mediaType: prepared.mediaType,
            sizeBytes: prepared.sizeBytes,
            sha256: prepared.sha256,
            objectKey: prepared.objectKey,
            uploadedById: principal.userId,
          },
          include: documentInclude,
        });
        await transaction.activeSiteSopDocument.upsert({
          where: { siteId },
          create: { siteId, organizationId, documentId: created.id },
          update: { documentId: created.id },
        });
        await transaction.auditLog.create({
          data: {
            actorId: principal.userId,
            organizationId,
            eventType: 'SOP_VERSION_UPLOADED',
            entityType: 'SopDocumentVersion',
            entityId: created.id,
            requestId: request.requestId,
            ipAddress: request.ipAddress,
            userAgent: request.userAgent,
            metadata: {
              siteId,
              documentId: created.id,
              version,
              sizeBytes: prepared.sizeBytes,
              sha256: prepared.sha256,
            },
          },
        });
        return created;
      });
      return { data: toDocumentData(document, true) };
    } catch (error) {
      try {
        await this.storage.delete(prepared.objectKey);
      } catch {
        this.logger.error(
          `SOP object compensation failed requestId=${request.requestId}; orphan cleanup required.`,
        );
      }
      throw error;
    }
  }

  async content(
    organizationId: string,
    documentId: string,
  ): Promise<{ body: Buffer; mediaType: 'application/pdf'; contentDisposition: string }> {
    const document = await this.prisma.sopDocumentVersion.findFirst({
      where: { id: documentId, organizationId },
      select: { objectKey: true, originalFileName: true },
    });
    if (document === null) throw documentNotFound();
    const stored = await this.storage.get(document.objectKey);
    if (stored === null) throw documentNotFound();
    return {
      body: stored.body,
      mediaType: 'application/pdf',
      contentDisposition: safeContentDisposition(document.originalFileName),
    };
  }

  private async requireSite(organizationId: string, siteId: string): Promise<void> {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId },
      select: { id: true },
    });
    if (site === null) throw siteNotFound();
  }
}

function toDocumentData(document: DocumentRow, isActive: boolean): SopDocumentData {
  return {
    id: document.id,
    siteId: document.siteId,
    version: document.version,
    title: document.title,
    description: document.description,
    originalFileName: document.originalFileName,
    mediaType: 'application/pdf',
    sizeBytes: document.sizeBytes,
    sha256: document.sha256,
    uploadedBy: document.uploadedBy,
    uploadedAt: document.uploadedAt.toISOString(),
    isActive,
  };
}

function siteNotFound(): NotFoundException {
  return new NotFoundException({ code: 'SITE_NOT_FOUND', message: 'Site tidak ditemukan.' });
}

function sopNotFound(): NotFoundException {
  return new NotFoundException({ code: 'SOP_NOT_FOUND', message: 'SOP resmi belum tersedia.' });
}

function documentNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'SOP_DOCUMENT_NOT_FOUND',
    message: 'Dokumen SOP tidak ditemukan.',
  });
}
