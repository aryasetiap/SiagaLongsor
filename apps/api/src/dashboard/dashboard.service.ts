import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  AlertSeverity,
  AlertStatus,
  ConnectivityStatus,
  DeviceLifecycleStatus,
  RiskLevel,
} from '../generated/prisma/enums.js';
import type { DashboardSummaryQueryDto, SensorSeriesQueryDto } from './dto/dashboard.dto.js';
import type {
  DashboardSummaryData,
  DashboardSummaryResponse,
  DashboardWindow,
  NormalizedSensorRange,
  SensorSeriesItem,
  SensorSeriesResponse,
} from './dashboard.types.js';
import { SensorSeriesCursorService } from './sensor-series-cursor.service.js';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_SENSOR_RANGE_HOURS = 24;
const MAX_SENSOR_RANGE_HOURS = 168;

const pointSelect = {
  id: true,
  isActive: true,
  currentState: {
    select: {
      serverRisk: true,
      connectivityStatus: true,
      latestTelemetryId: true,
      riskProfileId: true,
      device: { select: { lifecycleStatus: true } },
    },
  },
} satisfies Prisma.MonitoringPointSelect;

const deviceSelect = {
  id: true,
  lifecycleStatus: true,
  currentStates: {
    select: { connectivityStatus: true, latestTelemetryId: true },
    take: 1,
  },
} satisfies Prisma.DeviceSelect;

const telemetrySelect = {
  id: true,
  deviceId: true,
  deviceTimestamp: true,
  serverReceivedAt: true,
  tiltMagnitudeDeg: true,
  soilMoisturePct: true,
  rainfallMmHour: true,
  batteryVoltage: true,
  riskAssessment: { select: { affectsCurrentState: true } },
} satisfies Prisma.TelemetrySelect;

type SummaryPoint = Prisma.MonitoringPointGetPayload<{ select: typeof pointSelect }>;
type SummaryDevice = Prisma.DeviceGetPayload<{ select: typeof deviceSelect }>;
type SeriesTelemetry = Prisma.TelemetryGetPayload<{ select: typeof telemetrySelect }>;

interface SummaryCounts {
  readonly activeAlerts: number;
  readonly activeCriticalAlerts: number;
  readonly newAlerts: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursors: SensorSeriesCursorService,
  ) {}

  async summary(
    organizationId: string,
    query: DashboardSummaryQueryDto,
  ): Promise<DashboardSummaryResponse> {
    return this.prisma.$transaction(
      async (transaction) => {
        if (query.siteId !== undefined) {
          await requireSite(transaction, organizationId, query.siteId);
        }
        const clock = await transaction.$queryRaw<Array<{ generatedAt: Date }>>(Prisma.sql`
          SELECT CURRENT_TIMESTAMP AS "generatedAt"
        `);
        const generatedAt = clock[0]?.generatedAt;
        if (generatedAt === undefined) throw new Error('Database clock unavailable');
        const window = normalizeDashboardWindow(query.windowHours, generatedAt);
        const resourceScope = {
          organizationId,
          ...(query.siteId === undefined ? {} : { siteId: query.siteId }),
        };
        const unresolved = { in: [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED] };

        const points = await transaction.monitoringPoint.findMany({
          where: resourceScope,
          select: pointSelect,
        });
        const devices = await transaction.device.findMany({
          where: resourceScope,
          select: deviceSelect,
        });
        const activeAlerts = await transaction.alert.count({
          where: { ...resourceScope, status: unresolved },
        });
        const activeCriticalAlerts = await transaction.alert.count({
          where: {
            ...resourceScope,
            status: unresolved,
            severity: AlertSeverity.CRITICAL,
          },
        });
        const newAlerts = await transaction.alert.count({
          where: buildNewAlertWhere(resourceScope, window),
        });

        return {
          data: buildDashboardSummary(generatedAt, window, points, devices, {
            activeAlerts,
            activeCriticalAlerts,
            newAlerts,
          }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async sensorSeries(
    organizationId: string,
    monitoringPointId: string,
    query: SensorSeriesQueryDto,
  ): Promise<SensorSeriesResponse> {
    const point = await this.prisma.monitoringPoint.findFirst({
      where: { id: monitoringPointId, organizationId },
      select: { id: true },
    });
    if (point === null) throw monitoringPointNotFound();

    const evaluationTime = new Date();
    const decoded =
      query.cursor === undefined
        ? null
        : this.cursors.decode(
            query.cursor,
            organizationId,
            monitoringPointId,
            query,
            evaluationTime,
          );
    const range =
      decoded?.range ?? normalizeSensorSeriesRange(query.from, query.to, evaluationTime);
    const boundary = decoded === null ? null : decoded;
    const rows = await this.prisma.telemetry.findMany({
      where: {
        monitoringPointId,
        device: { organizationId },
        deviceTimestamp: { gte: range.from, lt: range.to },
        ...(query.includeLate
          ? {}
          : {
              NOT: {
                riskAssessment: { is: { affectsCurrentState: false } },
              },
            }),
        ...(boundary === null ? {} : sensorBoundaryWhere(boundary)),
      },
      select: telemetrySelect,
      orderBy: [{ deviceTimestamp: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows.at(-1);
    return {
      data: {
        items: pageRows.map(toSensorSeriesItem),
        hasMore,
        nextCursor:
          hasMore && last !== undefined
            ? this.cursors.encode(
                organizationId,
                monitoringPointId,
                query.includeLate,
                { telemetryId: last.id, recordedAt: last.deviceTimestamp },
                range,
                evaluationTime,
              )
            : null,
      },
    };
  }
}

export function normalizeDashboardWindow(hours: number, generatedAt: Date): DashboardWindow {
  return {
    hours,
    from: new Date(generatedAt.getTime() - hours * HOUR_MS).toISOString(),
    to: generatedAt.toISOString(),
  };
}

export function normalizeSensorSeriesRange(
  fromValue: string | undefined,
  toValue: string | undefined,
  evaluationTime: Date,
): NormalizedSensorRange {
  const to = toValue === undefined ? evaluationTime : new Date(toValue);
  const from =
    fromValue === undefined
      ? new Date(to.getTime() - DEFAULT_SENSOR_RANGE_HOURS * HOUR_MS)
      : new Date(fromValue);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw rangeValidationError('from', 'Rentang waktu harus menggunakan ISO 8601 yang valid.');
  }
  if (from >= to) {
    throw rangeValidationError('from', 'from harus lebih awal daripada to.');
  }
  if (to.getTime() - from.getTime() > MAX_SENSOR_RANGE_HOURS * HOUR_MS) {
    throw rangeValidationError('from', 'Rentang waktu maksimum adalah 168 jam.');
  }
  return { from, to };
}

export function buildDashboardSummary(
  generatedAt: Date,
  window: DashboardWindow,
  points: readonly SummaryPoint[],
  devices: readonly SummaryDevice[],
  counts: SummaryCounts,
): DashboardSummaryData {
  const activePoints = points.filter((point) => point.isActive);
  const riskDistribution = { safe: 0, watch: 0, danger: 0, unknown: 0 };
  for (const point of activePoints) {
    const state = point.currentState;
    const trusted =
      state !== null &&
      state.connectivityStatus === ConnectivityStatus.ONLINE &&
      state.latestTelemetryId !== null &&
      state.riskProfileId !== null &&
      state.device?.lifecycleStatus === DeviceLifecycleStatus.ENABLED;
    const risk = trusted ? state.serverRisk : RiskLevel.UNKNOWN;
    riskDistribution[risk.toLowerCase() as Lowercase<RiskLevel>] += 1;
  }

  const enabledDevices = devices.filter(
    (device) => device.lifecycleStatus === DeviceLifecycleStatus.ENABLED,
  );
  const connectivityDistribution = { online: 0, delayed: 0, offline: 0, unknown: 0 };
  for (const device of enabledDevices) {
    const state = device.currentStates[0];
    const status =
      state === undefined || state.latestTelemetryId === null
        ? ConnectivityStatus.UNKNOWN
        : state.connectivityStatus;
    connectivityDistribution[status.toLowerCase() as Lowercase<ConnectivityStatus>] += 1;
  }

  return {
    generatedAt: generatedAt.toISOString(),
    window,
    monitoringPoints: {
      total: points.length,
      active: activePoints.length,
      inactive: points.length - activePoints.length,
    },
    riskDistribution,
    devices: {
      total: devices.length,
      enabled: enabledDevices.length,
      disabled: devices.length - enabledDevices.length,
    },
    connectivityDistribution,
    alerts: {
      active: counts.activeAlerts,
      activeCritical: counts.activeCriticalAlerts,
      newInWindow: counts.newAlerts,
    },
  };
}

export function buildNewAlertWhere(
  scope: { readonly organizationId: string; readonly siteId?: string },
  window: DashboardWindow,
): Prisma.AlertWhereInput {
  return {
    ...scope,
    firstObservedAt: { gte: new Date(window.from), lt: new Date(window.to) },
  };
}

export function sensorBoundaryWhere(boundary: {
  readonly recordedAt: Date;
  readonly telemetryId: string;
}): Prisma.TelemetryWhereInput {
  return {
    OR: [
      { deviceTimestamp: { gt: boundary.recordedAt } },
      {
        deviceTimestamp: boundary.recordedAt,
        id: { gt: boundary.telemetryId },
      },
    ],
  };
}

export function toSensorSeriesItem(telemetry: SeriesTelemetry): SensorSeriesItem {
  return {
    telemetryId: telemetry.id,
    deviceId: telemetry.deviceId,
    recordedAt: telemetry.deviceTimestamp.toISOString(),
    serverReceivedAt: telemetry.serverReceivedAt.toISOString(),
    isLate: telemetry.riskAssessment?.affectsCurrentState === false,
    tiltMagnitudeDeg: telemetry.tiltMagnitudeDeg.toNumber(),
    soilMoisturePct: telemetry.soilMoisturePct.toNumber(),
    rainfallMmHour: telemetry.rainfallMmHour.toNumber(),
    batteryVoltage: telemetry.batteryVoltage?.toNumber() ?? null,
  };
}

async function requireSite(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  siteId: string,
): Promise<void> {
  const site = await transaction.site.findFirst({
    where: { id: siteId, organizationId },
    select: { id: true },
  });
  if (site === null) {
    throw new NotFoundException({
      code: 'SITE_NOT_FOUND',
      message: 'Site tidak ditemukan.',
    });
  }
}

function monitoringPointNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'MONITORING_POINT_NOT_FOUND',
    message: 'Monitoring point tidak ditemukan.',
  });
}

function rangeValidationError(field: string, message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Parameter query tidak valid.',
    details: [{ field, messages: [message] }],
  });
}
