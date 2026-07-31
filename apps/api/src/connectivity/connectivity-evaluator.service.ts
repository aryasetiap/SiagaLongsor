import { Injectable } from '@nestjs/common';

import { AlertObservationService } from '../alerts/alert-observation.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { DeviceLifecycleStatus, RiskLevel } from '../generated/prisma/enums.js';
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
    const states = await this.prisma.currentMonitoringPointState.findMany({
      where: { device: { lifecycleStatus: DeviceLifecycleStatus.ENABLED } },
      include: {
        device: true,
        latestTelemetry: true,
        riskProfile: true,
        site: {
          include: {
            riskProfiles: {
              where: { isActive: true },
              take: 1,
            },
          },
        },
      },
    });

    let evaluated = 0;
    for (const state of states) {
      if (state.device === null || state.latestTelemetry === null) continue;
      const device = state.device;
      const profile = state.riskProfile ?? state.site.riskProfiles[0];
      if (profile === undefined || profile === null) continue;
      const decision = evaluateConnectivity({
        lifecycleStatus: device.lifecycleStatus,
        serverReceivedAt: state.latestTelemetry.serverReceivedAt,
        evaluationTime,
        onlineWithinMinutes: profile.onlineWithinMinutes,
        offlineAfterMinutes: profile.offlineAfterMinutes,
      });
      const target = decision.status;
      if (
        state.connectivityStatus === target &&
        state.evaluatedAt.getTime() === evaluationTime.getTime()
      ) {
        continue;
      }

      await this.prisma.$transaction(async (transaction) => {
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
        if (reason !== null) {
          const type = decision.alertType;
          if (type === null) return;
          await this.alerts.observe(transaction, {
            organizationId: state.organizationId,
            siteId: state.siteId,
            monitoringPointId: state.monitoringPointId,
            deviceId: state.deviceId,
            type,
            reasons: [reason],
            observedAt: evaluationTime,
            observationKey: `connectivity:${device.id}:${type}:${evaluationTime.toISOString()}`,
            eventType: 'CONNECTIVITY_TRANSITION',
          });
        }
      });
      evaluated += 1;
    }
    return evaluated;
  }
}
