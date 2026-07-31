import { Injectable, NotFoundException } from '@nestjs/common';

import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { AlertSeverity } from '../generated/prisma/enums.js';
import { AlertSort, type AlertListQueryDto } from '../risk/dto/risk-read.dto.js';
import type { RiskReason } from '../risk/risk-engine.types.js';
import type { AlertData, AlertListResponse, AlertResponse } from '../risk/risk-read.types.js';

const include = {
  site: true,
  monitoringPoint: true,
} satisfies Prisma.AlertInclude;
type AlertRow = Prisma.AlertGetPayload<{ include: typeof include }>;

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursors: SignedCursorService,
  ) {}

  async list(organizationId: string, query: AlertListQueryDto): Promise<AlertListResponse> {
    const rows = await this.prisma.alert.findMany({
      where: {
        organizationId,
        ...(query.siteId === undefined ? {} : { siteId: query.siteId }),
        ...(query.monitoringPointId === undefined
          ? {}
          : { monitoringPointId: query.monitoringPointId }),
        ...(query.type === undefined ? {} : { type: query.type }),
        ...(query.severity === undefined ? {} : { severity: query.severity }),
        ...(query.status === undefined ? {} : { status: query.status }),
      },
      include,
    });
    rows.sort(alertComparator(query.sort));
    const context = {
      endpoint: 'alerts',
      organizationId,
      siteId: query.siteId ?? null,
      monitoringPointId: query.monitoringPointId ?? null,
      type: query.type ?? null,
      severity: query.severity ?? null,
      status: query.status ?? null,
      sort: query.sort,
    };
    const boundary = query.cursor === undefined ? null : this.cursors.decode(query.cursor, context);
    const remaining =
      boundary === null ? rows : rows.filter((row) => isAfterBoundary(row, boundary, query.sort));
    const pageRows = remaining.slice(0, query.limit);
    const hasMore = remaining.length > query.limit;
    const last = pageRows.at(-1);
    return {
      data: pageRows.map(toAlertData),
      page: {
        hasMore,
        nextCursor:
          hasMore && last !== undefined
            ? this.cursors.encode(context, {
                id: last.id,
                value: alertSortValue(last, query.sort),
              })
            : null,
      },
    };
  }

  async get(organizationId: string, alertId: string): Promise<AlertResponse> {
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId },
      include,
    });
    if (alert === null) {
      throw new NotFoundException({
        code: 'ALERT_NOT_FOUND',
        message: 'Alert tidak ditemukan.',
      });
    }
    return { data: toAlertData(alert) };
  }
}

function toAlertData(alert: AlertRow): AlertData {
  return {
    id: alert.id,
    organizationId: alert.organizationId,
    site: { id: alert.site.id, name: alert.site.name, timezone: alert.site.timezone },
    monitoringPoint: {
      id: alert.monitoringPoint.id,
      name: alert.monitoringPoint.name,
      locationDescription: alert.monitoringPoint.locationDescription,
      isActive: alert.monitoringPoint.isActive,
    },
    deviceId: alert.deviceId,
    type: alert.type,
    severity: alert.severity,
    status: alert.status,
    reasons: alert.reasons as RiskReason[],
    occurrenceCount: alert.occurrenceCount,
    firstObservedAt: alert.firstObservedAt.toISOString(),
    lastObservedAt: alert.lastObservedAt.toISOString(),
    createdAt: alert.createdAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString(),
  };
}

function alertComparator(sort: AlertSort): (left: AlertRow, right: AlertRow) => number {
  return (left, right) => {
    const comparison =
      sort === AlertSort.LAST_OBSERVED_AT_DESC
        ? right.lastObservedAt.getTime() - left.lastObservedAt.getTime()
        : sort === AlertSort.CREATED_AT_DESC
          ? right.createdAt.getTime() - left.createdAt.getTime()
          : severityRank(right.severity) - severityRank(left.severity);
    return comparison || right.id.localeCompare(left.id);
  };
}

function alertSortValue(alert: AlertRow, sort: AlertSort): string | number {
  if (sort === AlertSort.LAST_OBSERVED_AT_DESC) return alert.lastObservedAt.toISOString();
  if (sort === AlertSort.CREATED_AT_DESC) return alert.createdAt.toISOString();
  return severityRank(alert.severity);
}

function isAfterBoundary(
  alert: AlertRow,
  boundary: { readonly id: string; readonly value: string | number | null },
  sort: AlertSort,
): boolean {
  const value = alertSortValue(alert, sort);
  if (value === boundary.value) return alert.id < boundary.id;
  if (sort === AlertSort.SEVERITY_DESC) {
    return (
      typeof value === 'number' && typeof boundary.value === 'number' && value < boundary.value
    );
  }
  return typeof value === 'string' && typeof boundary.value === 'string' && value < boundary.value;
}

function severityRank(severity: AlertSeverity): number {
  return { INFO: 1, WARNING: 2, CRITICAL: 3 }[severity];
}
