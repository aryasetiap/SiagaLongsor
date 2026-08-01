import { BadRequestException, Injectable } from '@nestjs/common';

import { sanitizeLifecycleMetadata } from '../alerts/alert-events.service.js';
import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuditLogListQueryDto } from './dto/audit-log.dto.js';
import type { AuditLogData, AuditLogListResponse } from './audit-log.types.js';

const MAXIMUM_RANGE_MS = 30 * 24 * 60 * 60_000;

@Injectable()
export class AuditLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursors: SignedCursorService,
  ) {}

  async list(organizationId: string, query: AuditLogListQueryDto): Promise<AuditLogListResponse> {
    const from = query.from === undefined ? null : new Date(query.from);
    const to = query.to === undefined ? null : new Date(query.to);
    validateRange(from, to);
    const context = {
      endpoint: 'audit-logs',
      organizationId,
      eventType: query.eventType ?? null,
      entityType: query.entityType ?? null,
      entityId: query.entityId ?? null,
      actorId: query.actorId ?? null,
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    };
    const boundary = query.cursor === undefined ? null : this.cursors.decode(query.cursor, context);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        ...(query.eventType === undefined ? {} : { eventType: query.eventType }),
        ...(query.entityType === undefined ? {} : { entityType: query.entityType }),
        ...(query.entityId === undefined ? {} : { entityId: query.entityId }),
        ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
        ...dateFilter(from, to),
        ...(boundary === null
          ? {}
          : {
              AND: [
                {
                  OR: [
                    { createdAt: { lt: new Date(String(boundary.value)) } },
                    { createdAt: new Date(String(boundary.value)), id: { lt: boundary.id } },
                  ],
                },
              ],
            }),
      },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    return {
      data: pageRows.map(toAuditLogData),
      page: {
        hasMore,
        nextCursor:
          hasMore && last !== undefined
            ? this.cursors.encode(context, { id: last.id, value: last.createdAt.toISOString() })
            : null,
      },
    };
  }
}

type AuditLogRow = Prisma.AuditLogGetPayload<{
  include: { actor: { select: { id: true; name: true } } };
}>;

function dateFilter(from: Date | null, to: Date | null): Prisma.AuditLogWhereInput {
  if (from === null && to === null) return {};
  return {
    createdAt: {
      ...(from === null ? {} : { gte: from }),
      ...(to === null ? {} : { lt: to }),
    },
  };
}

export function validateRange(from: Date | null, to: Date | null): void {
  if (
    from !== null &&
    to !== null &&
    (from >= to || to.getTime() - from.getTime() > MAXIMUM_RANGE_MS)
  ) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Rentang audit harus meningkat dan maksimum 30 hari.',
    });
  }
}

function toAuditLogData(entry: AuditLogRow): AuditLogData {
  return {
    id: entry.id,
    eventType: entry.eventType,
    entityType: entry.entityType,
    entityId: entry.entityId,
    actor: entry.actor === null ? null : { id: entry.actor.id, name: entry.actor.name },
    requestId: entry.requestId,
    metadata: sanitizeLifecycleMetadata(entry.eventType, entry.metadata),
    createdAt: entry.createdAt.toISOString(),
  };
}
