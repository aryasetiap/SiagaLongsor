import { Injectable, NotFoundException } from '@nestjs/common';

import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AlertEventListQueryDto } from './dto/alert-lifecycle.dto.js';
import type { AlertEventData, AlertEventListResponse } from './alert-lifecycle.types.js';

const lifecycleEventTypes = new Set(['ALERT_ACKNOWLEDGED', 'ALERT_RESOLVED', 'ALERT_FALSE_ALARM']);

@Injectable()
export class AlertEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursors: SignedCursorService,
  ) {}

  async list(
    organizationId: string,
    alertId: string,
    query: AlertEventListQueryDto,
  ): Promise<AlertEventListResponse> {
    const exists = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId },
      select: { id: true },
    });
    if (exists === null) {
      throw new NotFoundException({
        code: 'ALERT_NOT_FOUND',
        message: 'Alert tidak ditemukan.',
      });
    }
    const context = { endpoint: 'alert-events', organizationId, alertId };
    const boundary = query.cursor === undefined ? null : this.cursors.decode(query.cursor, context);
    const rows = await this.prisma.alertEvent.findMany({
      where: {
        alertId,
        ...(boundary === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: new Date(String(boundary.value)) } },
                { createdAt: new Date(String(boundary.value)), id: { lt: boundary.id } },
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
      data: pageRows.map(toAlertEventData),
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

type AlertEventRow = Prisma.AlertEventGetPayload<{
  include: { actor: { select: { id: true; name: true } } };
}>;

function toAlertEventData(event: AlertEventRow): AlertEventData {
  return {
    id: event.id,
    eventType: event.eventType,
    observedAt: event.observedAt?.toISOString() ?? null,
    actedAt: event.actedAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
    actor: event.actor === null ? null : { id: event.actor.id, name: event.actor.name },
    metadata: sanitizeLifecycleMetadata(event.eventType, event.metadata),
    riskAssessmentId: event.riskAssessmentId,
    telemetryId: event.telemetryId,
  };
}

export function sanitizeLifecycleMetadata(
  eventType: string,
  metadata: Prisma.JsonValue,
): Readonly<Record<string, unknown>> {
  if (
    !lifecycleEventTypes.has(eventType) ||
    metadata === null ||
    Array.isArray(metadata) ||
    typeof metadata !== 'object'
  ) {
    return {};
  }
  const source = metadata as Record<string, unknown>;
  const allowed = [
    'actorId',
    'actionId',
    'note',
    'fieldCondition',
    'sopExecuted',
    'resolutionNote',
    'reason',
    'previousStatus',
    'nextStatus',
  ] as const;
  return Object.fromEntries(
    allowed.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
}
