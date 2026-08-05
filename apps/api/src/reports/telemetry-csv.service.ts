import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { TelemetryCsvQueryDto } from './dto/reports.dto.js';
import { parseReportRange, type ReportRange } from './report-range.js';
import type { TelemetryCsvRecord } from './telemetry-csv.js';

const BATCH_SIZE = 500;
const telemetryCsvSelect = {
  id: true,
  deviceTimestamp: true,
  serverReceivedAt: true,
  tiltMagnitudeDeg: true,
  soilMoisturePct: true,
  rainfallMmHour: true,
  batteryVoltage: true,
  firmwareVersion: true,
  monitoringPoint: { select: { name: true } },
  device: { select: { hardwareId: true } },
  riskAssessment: {
    select: { serverRisk: true, riskProfileVersion: true, affectsCurrentState: true },
  },
} satisfies Prisma.TelemetrySelect;
type TelemetryCsvRow = Prisma.TelemetryGetPayload<{ select: typeof telemetryCsvSelect }>;

export interface PreparedTelemetryCsvExport {
  readonly siteId: string;
  readonly range: ReportRange;
  readonly records: AsyncGenerator<TelemetryCsvRecord>;
}

@Injectable()
export class TelemetryCsvService {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(
    organizationId: string,
    query: TelemetryCsvQueryDto,
  ): Promise<PreparedTelemetryCsvExport> {
    const range = parseReportRange(query.from, query.to);
    const site = await this.prisma.site.findFirst({
      where: { id: query.siteId, organizationId },
      select: { id: true },
    });
    if (site === null) throw siteNotFound();
    if (query.monitoringPointId !== undefined) {
      const point = await this.prisma.monitoringPoint.findFirst({
        where: { id: query.monitoringPointId, siteId: query.siteId, organizationId },
        select: { id: true },
      });
      if (point === null) throw monitoringPointNotFound();
    }
    return {
      siteId: site.id,
      range,
      records: this.records(organizationId, query.siteId, query.monitoringPointId, range),
    };
  }

  private async *records(
    organizationId: string,
    siteId: string,
    monitoringPointId: string | undefined,
    range: ReportRange,
  ): AsyncGenerator<TelemetryCsvRecord> {
    let boundary: { readonly recordedAt: Date; readonly id: string } | null = null;
    while (true) {
      const rows: TelemetryCsvRow[] = await this.prisma.telemetry.findMany({
        where: {
          deviceTimestamp: { gte: range.from, lt: range.to },
          monitoringPoint: { organizationId, siteId },
          ...(monitoringPointId === undefined ? {} : { monitoringPointId }),
          ...(boundary === null
            ? {}
            : {
                OR: [
                  { deviceTimestamp: { gt: boundary.recordedAt } },
                  { deviceTimestamp: boundary.recordedAt, id: { gt: boundary.id } },
                ],
              }),
        },
        select: telemetryCsvSelect,
        orderBy: [{ deviceTimestamp: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
      });
      for (const row of rows) {
        yield {
          recordedAt: row.deviceTimestamp.toISOString(),
          serverReceivedAt: row.serverReceivedAt.toISOString(),
          monitoringPointName: row.monitoringPoint.name,
          hardwareId: row.device.hardwareId,
          tiltMagnitudeDeg: row.tiltMagnitudeDeg?.toString() ?? '',
          soilMoisturePct: row.soilMoisturePct?.toString() ?? '',
          rainfallMmHour: row.rainfallMmHour?.toString() ?? '',
          batteryVoltage: row.batteryVoltage?.toString() ?? '',
          firmwareVersion: row.firmwareVersion,
          serverRisk: row.riskAssessment?.serverRisk ?? null,
          riskProfileVersion: row.riskAssessment?.riskProfileVersion ?? null,
          affectsCurrentState: row.riskAssessment?.affectsCurrentState ?? null,
        };
      }
      const last: TelemetryCsvRow | undefined = rows.at(-1);
      if (last === undefined || rows.length < BATCH_SIZE) return;
      boundary = { recordedAt: last.deviceTimestamp, id: last.id };
    }
  }
}

function siteNotFound(): NotFoundException {
  return new NotFoundException({ code: 'SITE_NOT_FOUND', message: 'Site tidak ditemukan.' });
}

function monitoringPointNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'MONITORING_POINT_NOT_FOUND',
    message: 'Titik monitoring tidak ditemukan.',
  });
}
