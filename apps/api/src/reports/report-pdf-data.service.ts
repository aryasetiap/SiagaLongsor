import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import type { ReportPdfInput } from './report-pdf.js';

export interface ReportSourceJob {
  readonly organizationId: string;
  readonly siteId: string;
  readonly from: Date;
  readonly to: Date;
  readonly site: { readonly name: string; readonly timezone: string };
  readonly createdBy: { readonly name: string };
}

@Injectable()
export class ReportPdfDataService {
  constructor(private readonly prisma: PrismaService) {}

  async load(job: ReportSourceJob, generatedAt: Date): Promise<ReportPdfInput> {
    const [telemetry, risks, alerts] = await Promise.all([
      this.prisma.telemetry.aggregate({
        where: {
          deviceTimestamp: { gte: job.from, lt: job.to },
          monitoringPoint: { organizationId: job.organizationId, siteId: job.siteId },
        },
        _count: { _all: true },
        _avg: {
          tiltMagnitudeDeg: true,
          soilMoisturePct: true,
          rainfallMmHour: true,
          batteryVoltage: true,
        },
      }),
      this.prisma.riskAssessment.groupBy({
        by: ['serverRisk'],
        where: {
          organizationId: job.organizationId,
          siteId: job.siteId,
          evaluatedAt: { gte: job.from, lt: job.to },
        },
        _count: { _all: true },
      }),
      this.prisma.alert.groupBy({
        by: ['status'],
        where: {
          organizationId: job.organizationId,
          siteId: job.siteId,
          firstObservedAt: { lt: job.to },
          lastObservedAt: { gte: job.from },
        },
        _count: { _all: true },
      }),
    ]);
    const riskCounts = { SAFE: 0, WATCH: 0, DANGER: 0, UNKNOWN: 0 };
    for (const row of risks) riskCounts[row.serverRisk] = row._count._all;
    const alertCounts = { ACTIVE: 0, ACKNOWLEDGED: 0, RESOLVED: 0, FALSE_ALARM: 0 };
    for (const row of alerts) alertCounts[row.status] = row._count._all;
    return {
      siteName: job.site.name,
      siteTimezone: job.site.timezone,
      from: job.from,
      to: job.to,
      generatedAt,
      createdByName: job.createdBy.name,
      telemetry: {
        count: telemetry._count._all,
        averageTiltMagnitudeDeg: telemetry._avg.tiltMagnitudeDeg?.toString() ?? null,
        averageSoilMoisturePct: telemetry._avg.soilMoisturePct?.toString() ?? null,
        averageRainfallMmHour: telemetry._avg.rainfallMmHour?.toString() ?? null,
        averageBatteryVoltage: telemetry._avg.batteryVoltage?.toString() ?? null,
      },
      riskCounts,
      alertCounts,
    };
  }
}
