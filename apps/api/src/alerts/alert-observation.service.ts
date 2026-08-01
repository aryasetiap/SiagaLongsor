import { Injectable } from '@nestjs/common';

import { Prisma, type Alert } from '../generated/prisma/client.js';
import { AlertSeverity, AlertStatus, type AlertType } from '../generated/prisma/enums.js';
import type { RiskReason } from '../risk/risk-engine.types.js';

export interface AlertObservation {
  readonly organizationId: string;
  readonly siteId: string;
  readonly monitoringPointId: string;
  readonly deviceId: string | null;
  readonly type: AlertType;
  readonly reasons: readonly RiskReason[];
  readonly observedAt: Date;
  readonly observationKey: string;
  readonly riskAssessmentId?: string;
  readonly telemetryId?: string;
  readonly eventType?: 'CREATED' | 'OBSERVED' | 'CONNECTIVITY_TRANSITION';
}

@Injectable()
export class AlertObservationService {
  async observe(
    transaction: Prisma.TransactionClient,
    observation: AlertObservation,
  ): Promise<{ readonly alert: Alert; readonly changed: boolean }> {
    const deduplicationKey = alertDeduplicationKey(observation);
    await transaction.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${deduplicationKey}, 0))::text`,
    );

    const priorEvent = await transaction.alertEvent.findUnique({
      where: { observationKey: observation.observationKey },
      include: { alert: true },
    });
    if (priorEvent !== null) return { alert: priorEvent.alert, changed: false };

    let existing = await transaction.alert.findFirst({
      where: {
        deduplicationKey,
        status: { in: [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED] },
      },
    });
    if (existing !== null) {
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Alert" WHERE "id" = ${existing.id} FOR UPDATE`,
      );
      const locked = await transaction.alert.findUnique({ where: { id: existing.id } });
      existing =
        locked !== null &&
        (locked.status === AlertStatus.ACTIVE || locked.status === AlertStatus.ACKNOWLEDGED)
          ? locked
          : null;
    }
    const severity = severityFor(observation.type);
    const alert =
      existing === null
        ? await transaction.alert.create({
            data: {
              organizationId: observation.organizationId,
              siteId: observation.siteId,
              monitoringPointId: observation.monitoringPointId,
              deviceId: observation.deviceId,
              type: observation.type,
              severity,
              status: AlertStatus.ACTIVE,
              deduplicationKey,
              reasons: [...observation.reasons],
              firstObservedAt: observation.observedAt,
              lastObservedAt: observation.observedAt,
              occurrenceCount: 1,
            },
          })
        : await transaction.alert.update({
            where: { id: existing.id },
            data: {
              deviceId: observation.deviceId,
              severity,
              reasons: [...observation.reasons],
              lastObservedAt: observation.observedAt,
              occurrenceCount: { increment: 1 },
            },
          });

    await transaction.alertEvent.create({
      data: {
        alertId: alert.id,
        eventType: existing === null ? 'CREATED' : (observation.eventType ?? 'OBSERVED'),
        observationKey: observation.observationKey,
        ...(observation.riskAssessmentId === undefined
          ? {}
          : { riskAssessmentId: observation.riskAssessmentId }),
        ...(observation.telemetryId === undefined ? {} : { telemetryId: observation.telemetryId }),
        observedAt: observation.observedAt,
        metadata: {
          type: observation.type,
          severity,
          reasons: [...observation.reasons],
          occurrenceCount: alert.occurrenceCount,
        },
      },
    });

    if (existing === null) {
      await transaction.auditLog.create({
        data: {
          organizationId: observation.organizationId,
          actorId: null,
          eventType: 'ALERT_CREATED',
          entityType: 'Alert',
          entityId: alert.id,
          requestId: `system:${observation.observationKey}`.slice(0, 255),
          ipAddress: null,
          userAgent: null,
          metadata: {
            siteId: observation.siteId,
            monitoringPointId: observation.monitoringPointId,
            deviceId: observation.deviceId,
            type: observation.type,
            severity,
          },
        },
      });
    }
    return { alert, changed: true };
  }
}

export function alertDeduplicationKey(
  input: Pick<AlertObservation, 'organizationId' | 'siteId' | 'monitoringPointId' | 'type'>,
): string {
  return [
    input.organizationId,
    input.siteId,
    input.monitoringPointId,
    input.type,
    'unresolved',
  ].join('/');
}

export function severityFor(type: AlertType): AlertSeverity {
  if (type === 'RISK_DANGER' || type === 'DEVICE_OFFLINE') {
    return AlertSeverity.CRITICAL;
  }
  return AlertSeverity.WARNING;
}
