import { Injectable, NotFoundException } from '@nestjs/common';

import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  AlertSeverity,
  AlertStatus,
  ConnectivityStatus,
  DeviceLifecycleStatus,
  RiskLevel,
} from '../generated/prisma/enums.js';
import {
  MonitoringOverviewSort,
  type MonitoringOverviewQueryDto,
  type RiskAssessmentHistoryQueryDto,
} from './dto/risk-read.dto.js';
import type { RiskReason } from './risk-engine.types.js';
import type {
  MonitoringOverviewItem,
  MonitoringOverviewResponse,
  RiskAssessmentListResponse,
} from './risk-read.types.js';

const overviewInclude = {
  site: true,
  devices: {
    where: { lifecycleStatus: DeviceLifecycleStatus.ENABLED },
    orderBy: { createdAt: Prisma.SortOrder.desc },
    take: 1,
  },
  currentState: {
    include: {
      latestTelemetry: true,
      device: true,
    },
  },
  alerts: {
    where: { status: { in: [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED] } },
    select: { type: true, severity: true },
  },
} satisfies Prisma.MonitoringPointInclude;

type OverviewRow = Prisma.MonitoringPointGetPayload<{ include: typeof overviewInclude }>;

@Injectable()
export class RiskReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursors: SignedCursorService,
  ) {}

  async overview(
    organizationId: string,
    query: MonitoringOverviewQueryDto,
  ): Promise<MonitoringOverviewResponse> {
    const stateFilters: Prisma.MonitoringPointWhereInput[] = [];
    if (query.riskLevel !== undefined) {
      stateFilters.push(
        query.riskLevel === RiskLevel.UNKNOWN
          ? { OR: [{ currentState: null }, { currentState: { serverRisk: RiskLevel.UNKNOWN } }] }
          : { currentState: { serverRisk: query.riskLevel } },
      );
    }
    if (query.connectivityStatus !== undefined) {
      stateFilters.push(
        query.connectivityStatus === ConnectivityStatus.UNKNOWN
          ? {
              OR: [
                { currentState: null },
                {
                  currentState: {
                    connectivityStatus: ConnectivityStatus.UNKNOWN,
                  },
                },
              ],
            }
          : { currentState: { connectivityStatus: query.connectivityStatus } },
      );
    }
    const rows = await this.prisma.monitoringPoint.findMany({
      where: {
        organizationId,
        AND: stateFilters,
        ...(query.siteId === undefined ? {} : { siteId: query.siteId }),
        ...(query.search === undefined
          ? {}
          : {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { site: { name: { contains: query.search, mode: 'insensitive' } } },
              ],
            }),
      },
      include: overviewInclude,
    });
    const items = rows.map(toOverviewItem).sort(overviewComparator(query.sort));
    return this.pageOverview(organizationId, query, items);
  }

  async assessmentHistory(
    organizationId: string,
    monitoringPointId: string,
    query: RiskAssessmentHistoryQueryDto,
  ): Promise<RiskAssessmentListResponse> {
    const point = await this.prisma.monitoringPoint.findFirst({
      where: { id: monitoringPointId, organizationId },
      select: { id: true },
    });
    if (point === null) {
      throw new NotFoundException({
        code: 'MONITORING_POINT_NOT_FOUND',
        message: 'Monitoring point tidak ditemukan.',
      });
    }
    const context = {
      endpoint: 'risk-assessment-history',
      organizationId,
      monitoringPointId,
    };
    const boundary = query.cursor === undefined ? null : this.cursors.decode(query.cursor, context);
    const rows = await this.prisma.riskAssessment.findMany({
      where: {
        organizationId,
        monitoringPointId,
        ...(boundary === null
          ? {}
          : {
              OR: [
                { evaluatedAt: { lt: new Date(String(boundary.value)) } },
                {
                  evaluatedAt: new Date(String(boundary.value)),
                  id: { lt: boundary.id },
                },
              ],
            }),
      },
      orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows.at(-1);
    return {
      data: pageRows.map((row) => ({
        id: row.id,
        telemetryId: row.telemetryId,
        monitoringPointId: row.monitoringPointId,
        deviceId: row.deviceId,
        serverRisk: row.serverRisk,
        reasons: row.reasons as RiskReason[],
        firmwareRisk: row.firmwareRisk,
        firmwareSirenActive: row.firmwareSirenActive,
        affectsCurrentState: row.affectsCurrentState,
        evaluatedAt: row.evaluatedAt.toISOString(),
        profileId: row.riskProfileId,
        profileVersion: row.riskProfileVersion,
      })),
      page: {
        hasMore,
        nextCursor:
          hasMore && last !== undefined
            ? this.cursors.encode(context, {
                id: last.id,
                value: last.evaluatedAt.toISOString(),
              })
            : null,
      },
    };
  }

  private pageOverview(
    organizationId: string,
    query: MonitoringOverviewQueryDto,
    items: MonitoringOverviewItem[],
  ): MonitoringOverviewResponse {
    const context = {
      endpoint: 'monitoring-overview',
      organizationId,
      siteId: query.siteId ?? null,
      riskLevel: query.riskLevel ?? null,
      connectivityStatus: query.connectivityStatus ?? null,
      search: query.search?.toLowerCase() ?? null,
      sort: query.sort,
    };
    const boundary = query.cursor === undefined ? null : this.cursors.decode(query.cursor, context);
    const remaining =
      boundary === null
        ? items
        : items.filter((item) => isOverviewAfterBoundary(item, boundary, query.sort));
    const pageItems = remaining.slice(0, query.limit);
    const hasMore = remaining.length > query.limit;
    const last = pageItems.at(-1);
    return {
      data: pageItems,
      page: {
        hasMore,
        nextCursor:
          hasMore && last !== undefined
            ? this.cursors.encode(context, {
                id: last.monitoringPoint.id,
                value: overviewSortValue(last, query.sort),
              })
            : null,
      },
    };
  }
}

function toOverviewItem(row: OverviewRow): MonitoringOverviewItem {
  const state = row.currentState;
  const device = state?.device ?? row.devices[0] ?? null;
  const telemetry = state?.latestTelemetry ?? null;
  const severity = row.alerts.map((alert) => alert.severity);
  const highestSeverity = severity.includes(AlertSeverity.CRITICAL)
    ? AlertSeverity.CRITICAL
    : severity.includes(AlertSeverity.WARNING)
      ? AlertSeverity.WARNING
      : severity.includes(AlertSeverity.INFO)
        ? AlertSeverity.INFO
        : null;
  return {
    monitoringPoint: {
      id: row.id,
      name: row.name,
      locationDescription: row.locationDescription,
      isActive: row.isActive,
    },
    site: { id: row.site.id, name: row.site.name, timezone: row.site.timezone },
    device:
      device === null
        ? null
        : {
            id: device.id,
            hardwareId: device.hardwareId,
            displayName: device.displayName,
            lifecycleStatus: device.lifecycleStatus,
          },
    latestTelemetry:
      telemetry === null
        ? null
        : {
            telemetryId: telemetry.id,
            deviceTimestamp: telemetry.deviceTimestamp.toISOString(),
            serverReceivedAt: telemetry.serverReceivedAt.toISOString(),
            tiltMagnitudeDeg: telemetry.tiltMagnitudeDeg.toNumber(),
            soilMoisturePct: telemetry.soilMoisturePct.toNumber(),
            rainfallMmHour: telemetry.rainfallMmHour.toNumber(),
            batteryVoltage: telemetry.batteryVoltage.toNumber(),
          },
    currentState: {
      monitoringPointId: row.id,
      deviceId: state?.deviceId ?? null,
      serverRisk: state?.serverRisk ?? RiskLevel.UNKNOWN,
      connectivityStatus: state?.connectivityStatus ?? ConnectivityStatus.UNKNOWN,
      reasons: (state?.reasons as RiskReason[] | undefined) ?? ['REQUIRED_SENSOR_MISSING'],
      latestTelemetryId: state?.latestTelemetryId ?? null,
      evaluatedAt: (state?.evaluatedAt ?? row.updatedAt).toISOString(),
      lastTelemetryAt: state?.lastTelemetryAt?.toISOString() ?? null,
      profileId: state?.riskProfileId ?? null,
      profileVersion: state?.riskProfileVersion ?? null,
      activeAlertSummary: {
        count: row.alerts.length,
        highestSeverity,
        types: [...new Set(row.alerts.map((alert) => alert.type))],
      },
    },
  };
}

function overviewComparator(
  sort: MonitoringOverviewSort,
): (left: MonitoringOverviewItem, right: MonitoringOverviewItem) => number {
  return (left, right) => {
    const comparison =
      sort === MonitoringOverviewSort.NAME_ASC
        ? left.monitoringPoint.name.localeCompare(right.monitoringPoint.name)
        : sort === MonitoringOverviewSort.NAME_DESC
          ? right.monitoringPoint.name.localeCompare(left.monitoringPoint.name)
          : sort === MonitoringOverviewSort.RISK_DESC
            ? riskRank(right.currentState.serverRisk) - riskRank(left.currentState.serverRisk)
            : sort === MonitoringOverviewSort.CONNECTIVITY_DESC
              ? connectivityRank(right.currentState.connectivityStatus) -
                connectivityRank(left.currentState.connectivityStatus)
              : nullableDateDescending(
                  left.currentState.lastTelemetryAt,
                  right.currentState.lastTelemetryAt,
                );
    return comparison || left.monitoringPoint.id.localeCompare(right.monitoringPoint.id);
  };
}

function overviewSortValue(
  item: MonitoringOverviewItem,
  sort: MonitoringOverviewSort,
): string | number | null {
  if (sort === MonitoringOverviewSort.NAME_ASC || sort === MonitoringOverviewSort.NAME_DESC) {
    return item.monitoringPoint.name;
  }
  if (sort === MonitoringOverviewSort.RISK_DESC) return riskRank(item.currentState.serverRisk);
  if (sort === MonitoringOverviewSort.CONNECTIVITY_DESC) {
    return connectivityRank(item.currentState.connectivityStatus);
  }
  return item.currentState.lastTelemetryAt;
}

function isOverviewAfterBoundary(
  item: MonitoringOverviewItem,
  boundary: { readonly id: string; readonly value: string | number | null },
  sort: MonitoringOverviewSort,
): boolean {
  const value = overviewSortValue(item, sort);
  if (value === boundary.value) return item.monitoringPoint.id > boundary.id;
  if (sort === MonitoringOverviewSort.NAME_ASC) {
    return (
      typeof value === 'string' &&
      typeof boundary.value === 'string' &&
      value.localeCompare(boundary.value) > 0
    );
  }
  if (sort === MonitoringOverviewSort.NAME_DESC) {
    return (
      typeof value === 'string' &&
      typeof boundary.value === 'string' &&
      value.localeCompare(boundary.value) < 0
    );
  }
  if (
    sort === MonitoringOverviewSort.RISK_DESC ||
    sort === MonitoringOverviewSort.CONNECTIVITY_DESC
  ) {
    return (
      typeof value === 'number' && typeof boundary.value === 'number' && value < boundary.value
    );
  }
  if (boundary.value === null) return false;
  if (value === null) return true;
  return typeof value === 'string' && typeof boundary.value === 'string' && value < boundary.value;
}

function riskRank(risk: RiskLevel): number {
  return { UNKNOWN: 0, SAFE: 1, WATCH: 2, DANGER: 3 }[risk];
}

function connectivityRank(status: ConnectivityStatus): number {
  return { UNKNOWN: 0, ONLINE: 1, DELAYED: 2, OFFLINE: 3 }[status];
}

function nullableDateDescending(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right.localeCompare(left);
}
