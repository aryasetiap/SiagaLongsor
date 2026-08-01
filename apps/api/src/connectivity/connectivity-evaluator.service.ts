import { Injectable } from '@nestjs/common';

import { AlertObservationService } from '../alerts/alert-observation.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma, type Device } from '../generated/prisma/client.js';
import { DeviceLifecycleStatus, RiskLevel } from '../generated/prisma/enums.js';
import { RealtimePostCommitService } from '../realtime/realtime-post-commit.service.js';
import type { RealtimeDescriptor } from '../realtime/realtime.types.js';
import { evaluateConnectivity } from './connectivity-policy.js';
import { DistributedLockService } from './distributed-lock.service.js';

const lockKey = 'siagalongsor:phase-03:connectivity-evaluator';
const lockTtlMilliseconds = 240_000;

@Injectable()
export class ConnectivityEvaluatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: DistributedLockService,
    private readonly alerts: AlertObservationService,
    private readonly realtime: RealtimePostCommitService,
  ) {}

  async runOnce(
    evaluationTime: Date,
  ): Promise<{ readonly acquired: boolean; readonly evaluated: number }> {
    const result = await this.locks.runWithLock(lockKey, lockTtlMilliseconds, async () =>
      this.evaluate(evaluationTime),
    );
    return result.acquired
      ? { acquired: true, evaluated: result.value }
      : { acquired: false, evaluated: 0 };
  }

  private async evaluate(evaluationTime: Date): Promise<number> {
    const candidates = await this.prisma.currentMonitoringPointState.findMany({
      where: { device: { lifecycleStatus: DeviceLifecycleStatus.ENABLED } },
      select: { monitoringPointId: true, deviceId: true },
    });

    let evaluated = 0;
    for (const candidate of candidates) {
      const deviceId = candidate.deviceId;
      if (deviceId === null) continue;
      const result = await this.prisma.$transaction((transaction) =>
        this.evaluateCandidate(
          transaction,
          {
            monitoringPointId: candidate.monitoringPointId,
            deviceId,
          },
          evaluationTime,
        ),
      );
      await this.realtime.dispatch(result.realtime);
      if (result.changed) evaluated += 1;
    }
    return evaluated;
  }

  private async evaluateCandidate(
    transaction: Prisma.TransactionClient,
    candidate: { readonly monitoringPointId: string; readonly deviceId: string },
    evaluationTime: Date,
  ): Promise<{ readonly changed: boolean; readonly realtime: readonly RealtimeDescriptor[] }> {
    const device = await lockDevice(transaction, candidate.deviceId);
    if (
      device === null ||
      device.lifecycleStatus !== DeviceLifecycleStatus.ENABLED ||
      device.monitoringPointId !== candidate.monitoringPointId
    ) {
      return { changed: false, realtime: [] };
    }

    const lockedState = await transaction.$queryRaw<Array<{ monitoringPointId: string }>>(
      Prisma.sql`
        SELECT "monitoringPointId"
        FROM "CurrentMonitoringPointState"
        WHERE "monitoringPointId" = ${candidate.monitoringPointId}
        FOR UPDATE
      `,
    );
    if (lockedState.length === 0) return { changed: false, realtime: [] };

    const state = await transaction.currentMonitoringPointState.findUnique({
      where: { monitoringPointId: candidate.monitoringPointId },
      include: { latestTelemetry: true },
    });
    if (
      state === null ||
      state.deviceId !== device.id ||
      state.siteId !== device.siteId ||
      state.organizationId !== device.organizationId ||
      state.latestTelemetry === null
    ) {
      return { changed: false, realtime: [] };
    }

    const profile = await transaction.riskProfile.findFirst({
      where: {
        organizationId: device.organizationId,
        siteId: device.siteId,
        isActive: true,
      },
    });
    if (profile === null) return { changed: false, realtime: [] };

    const decision = evaluateConnectivity({
      lifecycleStatus: device.lifecycleStatus,
      serverReceivedAt: state.latestTelemetry.serverReceivedAt,
      evaluationTime,
      onlineWithinMinutes: profile.onlineWithinMinutes,
      offlineAfterMinutes: profile.offlineAfterMinutes,
    });
    const target = decision.status;
    if (state.connectivityStatus === target) {
      return { changed: false, realtime: [] };
    }

    const reason = decision.reason;
    await transaction.currentMonitoringPointState.update({
      where: { monitoringPointId: state.monitoringPointId },
      data:
        reason === null
          ? { connectivityStatus: target, evaluatedAt: evaluationTime }
          : {
              connectivityStatus: target,
              serverRisk: RiskLevel.UNKNOWN,
              reasons: [reason],
              evaluatedAt: evaluationTime,
              watchConsecutiveSamples: 0,
              dangerConsecutiveSamples: 0,
              mismatchConsecutiveSamples: 0,
              pendingDowngradeRisk: null,
              pendingDowngradeSince: null,
            },
    });
    const realtime: RealtimeDescriptor[] = [
      {
        eventType: 'MONITORING_POINT_STATE_CHANGED',
        occurredAt: evaluationTime.toISOString(),
        organizationId: state.organizationId,
        siteId: state.siteId,
        monitoringPointId: state.monitoringPointId,
        alertId: null,
      },
    ];
    if (reason !== null && decision.alertType !== null) {
      const observation = await this.alerts.observe(transaction, {
        organizationId: state.organizationId,
        siteId: state.siteId,
        monitoringPointId: state.monitoringPointId,
        deviceId: device.id,
        type: decision.alertType,
        reasons: [reason],
        observedAt: evaluationTime,
        observationKey: `connectivity:${device.id}:${decision.alertType}:${evaluationTime.toISOString()}`,
        eventType: 'CONNECTIVITY_TRANSITION',
      });
      if (observation.realtime !== null) realtime.push(observation.realtime);
    }
    return { changed: true, realtime };
  }
}

async function lockDevice(
  transaction: Prisma.TransactionClient,
  deviceId: string,
): Promise<Device | null> {
  const rows = await transaction.$queryRaw<Array<Device>>(Prisma.sql`
    SELECT *
    FROM "Device"
    WHERE "id" = ${deviceId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}
