import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { Prisma } from '../generated/prisma/client.js';
import type { ServerRisk } from '../risk/risk-engine.types.js';

@Injectable()
export class NotificationOutboxService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async enqueueRiskTransition(
    transaction: Prisma.TransactionClient,
    input: {
      readonly auditLogId: string;
      readonly organizationId: string;
      readonly siteId: string;
      readonly monitoringPointId: string;
      readonly telemetryId: string | null;
      readonly previousStatus: ServerRisk;
      readonly currentStatus: ServerRisk;
      readonly reasons: readonly string[];
      readonly sensorSnapshot: {
        readonly tiltMagnitudeDeg: number | null;
        readonly soilMoisturePct: number | null;
        readonly rainfallMmHour: number | null;
      };
      readonly rainfallDuration: {
        readonly consecutiveModerateDays: number;
        readonly previousDailyTotalsMm: readonly number[];
      } | null;
      readonly occurredAt: Date;
    },
  ): Promise<void> {
    if (!this.config.telegram.enabled) return;

    const monitoringPoint = await transaction.monitoringPoint.findUnique({
      where: { id: input.monitoringPointId },
      select: {
        name: true,
        site: { select: { name: true, timezone: true } },
      },
    });
    if (monitoringPoint === null) return;

    const payload = {
      schemaVersion: 1,
      eventId: input.auditLogId,
      previousStatus: input.previousStatus,
      currentStatus: input.currentStatus,
      reasons: [...input.reasons],
      occurredAt: input.occurredAt.toISOString(),
      organizationId: input.organizationId,
      siteId: input.siteId,
      siteName: monitoringPoint.site.name,
      siteTimezone: monitoringPoint.site.timezone,
      monitoringPointId: input.monitoringPointId,
      monitoringPointName: monitoringPoint.name,
      telemetryId: input.telemetryId,
      sensorSnapshot: { ...input.sensorSnapshot },
      rainfallDuration:
        input.rainfallDuration === null
          ? null
          : {
              consecutiveModerateDays: input.rainfallDuration.consecutiveModerateDays,
              previousDailyTotalsMm: [...input.rainfallDuration.previousDailyTotalsMm],
            },
    } satisfies Prisma.InputJsonObject;

    await transaction.notificationOutbox.create({
      data: {
        eventKey: `telegram:risk-transition:${input.auditLogId}`,
        channel: 'TELEGRAM',
        eventType: 'RISK_STATUS_CHANGED',
        payload,
        nextAttemptAt: input.occurredAt,
      },
    });
  }
}
