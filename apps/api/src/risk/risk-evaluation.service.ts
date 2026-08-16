import { Injectable } from '@nestjs/common';

import {
  Prisma,
  type CurrentMonitoringPointState,
  type Device,
  type RiskProfile,
  type Telemetry,
} from '../generated/prisma/client.js';
import { NotificationOutboxService } from '../notifications/notification-outbox.service.js';
import { firmwareRiskFromRawPayload } from './firmware-assessment.js';
import { evaluateRisk } from './risk-engine.js';
import type { RiskEngineProfile, RiskEngineState } from './risk-engine.types.js';
import { summarizeRainfallDuration } from './rainfall-duration.js';

@Injectable()
export class RiskEvaluationService {
  constructor(private readonly notifications: NotificationOutboxService) {}

  async evaluateAcceptedTelemetry(
    transaction: Prisma.TransactionClient,
    input: {
      readonly device: Device;
      readonly telemetry: Telemetry;
      readonly affectsCurrentState: boolean;
      readonly evaluatedAt: Date;
    },
  ): Promise<void> {
    const profile = await transaction.riskProfile.findFirst({
      where: { siteId: input.device.siteId, isActive: true },
    });
    const previous = await transaction.currentMonitoringPointState.findUnique({
      where: { monitoringPointId: input.device.monitoringPointId },
    });
    const rainfallHistory =
      profile === null
        ? undefined
        : await loadRainfallHistory(transaction, input.device, input.telemetry, profile);
    const result = evaluateRisk({
      profile: profile === null ? null : toEngineProfile(profile),
      deviceId: input.device.id,
      deviceEnabled: input.device.lifecycleStatus === 'ENABLED',
      timestampTrusted: true,
      affectsCurrentState: input.affectsCurrentState,
      evaluatedAt: input.evaluatedAt,
      telemetry: {
        tiltMagnitudeDeg: input.telemetry.tiltMagnitudeDeg?.toNumber() ?? null,
        soilMoisturePct: input.telemetry.soilMoisturePct?.toNumber() ?? null,
        rainfallMmHour: input.telemetry.rainfallMmHour?.toNumber() ?? null,
        firmwareRisk: firmwareRiskFromRawPayload(input.telemetry.rawPayload),
      },
      ...(rainfallHistory === undefined ? {} : { rainfallHistory }),
      previous: previous === null ? null : toEngineState(previous),
    });

    if (profile !== null) {
      await transaction.riskAssessment.create({
        data: {
          organizationId: input.device.organizationId,
          siteId: input.device.siteId,
          monitoringPointId: input.device.monitoringPointId,
          deviceId: input.device.id,
          telemetryId: input.telemetry.id,
          riskProfileId: profile.id,
          riskProfileVersion: profile.version,
          serverRisk: result.assessmentRisk,
          firmwareRisk: input.telemetry.firmwareRiskLevel,
          firmwareSirenActive: input.telemetry.firmwareSirenActive,
          reasons: [...result.reasons],
          affectsCurrentState: result.affectsCurrentState,
          evaluatedAt: input.evaluatedAt,
        },
      });
    }

    if (result.nextState === null) return;
    const previousStatus = previous?.serverRisk ?? 'UNKNOWN';
    await transaction.currentMonitoringPointState.upsert({
      where: { monitoringPointId: input.device.monitoringPointId },
      create: {
        monitoringPointId: input.device.monitoringPointId,
        organizationId: input.device.organizationId,
        siteId: input.device.siteId,
        deviceId: input.device.id,
        serverRisk: result.nextState.serverRisk,
        connectivityStatus: result.nextState.connectivity,
        reasons: [...result.reasons],
        latestTelemetryId: input.telemetry.id,
        evaluatedAt: input.evaluatedAt,
        lastTelemetryAt: input.telemetry.deviceTimestamp,
        riskProfileId: profile?.id ?? null,
        riskProfileVersion: profile?.version ?? null,
        watchConsecutiveSamples: result.nextState.watchCount,
        dangerConsecutiveSamples: result.nextState.dangerCount,
        mismatchConsecutiveSamples: result.nextState.mismatchCount,
        pendingDowngradeRisk: result.nextState.pendingDowngradeRisk,
        pendingDowngradeSince: result.nextState.pendingDowngradeSince,
      },
      update: {
        deviceId: input.device.id,
        siteId: input.device.siteId,
        serverRisk: result.nextState.serverRisk,
        connectivityStatus: result.nextState.connectivity,
        reasons: [...result.reasons],
        latestTelemetryId: input.telemetry.id,
        evaluatedAt: input.evaluatedAt,
        lastTelemetryAt: input.telemetry.deviceTimestamp,
        riskProfileId: profile?.id ?? null,
        riskProfileVersion: profile?.version ?? null,
        watchConsecutiveSamples: result.nextState.watchCount,
        dangerConsecutiveSamples: result.nextState.dangerCount,
        mismatchConsecutiveSamples: result.nextState.mismatchCount,
        pendingDowngradeRisk: result.nextState.pendingDowngradeRisk,
        pendingDowngradeSince: result.nextState.pendingDowngradeSince,
      },
    });
    if (previousStatus !== result.nextState.serverRisk) {
      const sensorSnapshot = {
        tiltMagnitudeDeg: input.telemetry.tiltMagnitudeDeg?.toNumber() ?? null,
        soilMoisturePct: input.telemetry.soilMoisturePct?.toNumber() ?? null,
        rainfallMmHour: input.telemetry.rainfallMmHour?.toNumber() ?? null,
      };
      const rainfallDuration =
        rainfallHistory === undefined
          ? null
          : {
              consecutiveModerateDays: rainfallHistory.consecutiveModerateDays,
              previousDailyTotalsMm: [...rainfallHistory.previousDailyTotalsMm],
            };
      const auditLog = await transaction.auditLog.create({
        data: {
          organizationId: input.device.organizationId,
          actorId: null,
          eventType: 'RISK_STATUS_CHANGED',
          entityType: 'CurrentMonitoringPointState',
          entityId: input.device.monitoringPointId,
          requestId: `telemetry:${input.telemetry.id}`,
          metadata: {
            previousStatus,
            currentStatus: result.nextState.serverRisk,
            reasons: [...result.reasons],
            telemetryId: input.telemetry.id,
            riskProfileId: profile?.id ?? null,
            riskProfileVersion: profile?.version ?? null,
            sensorSnapshot,
            rainfallDuration,
            occurredAt: input.evaluatedAt.toISOString(),
          },
        },
      });
      await this.notifications.enqueueRiskTransition(transaction, {
        auditLogId: auditLog.id,
        organizationId: input.device.organizationId,
        siteId: input.device.siteId,
        monitoringPointId: input.device.monitoringPointId,
        telemetryId: input.telemetry.id,
        previousStatus,
        currentStatus: result.nextState.serverRisk,
        reasons: result.reasons,
        sensorSnapshot,
        rainfallDuration,
        occurredAt: input.evaluatedAt,
      });
    }
  }
}

function toEngineProfile(profile: RiskProfile): RiskEngineProfile {
  return {
    id: profile.id,
    version: profile.version,
    safe: {
      tiltMagnitudeDegLt: profile.safeTiltMagnitudeDegLt.toNumber(),
      soilMoisturePctLt: profile.safeSoilMoisturePctLt.toNumber(),
      rainfallMmHourLt: profile.safeRainfallMmHourLt.toNumber(),
    },
    danger: {
      tiltMagnitudeDegGt: profile.dangerTiltMagnitudeDegGt.toNumber(),
      rainfallMmHourGt: profile.dangerRainfallMmHourGt.toNumber(),
      soilMoisturePctGt: profile.dangerSoilMoisturePctGt.toNumber(),
    },
    rainfallDuration: {
      moderateDailyMinMm: profile.moderateRainfallDailyMinMm.toNumber(),
      moderateDailyMaxMm: profile.moderateRainfallDailyMaxMm.toNumber(),
      consecutiveDays: profile.moderateRainfallConsecutiveDays,
      continuationRainfallMmHourGt: profile.rainfallContinuationMmHourGt.toNumber(),
    },
    ranges: {
      tiltMagnitudeDeg: [
        profile.technicalTiltMagnitudeMin.toNumber(),
        profile.technicalTiltMagnitudeMax?.toNumber() ?? null,
      ],
      soilMoisturePct: [
        profile.technicalSoilMoistureMin.toNumber(),
        profile.technicalSoilMoistureMax?.toNumber() ?? null,
      ],
      rainfallMmHour: [
        profile.technicalRainfallMin.toNumber(),
        profile.technicalRainfallMax?.toNumber() ?? null,
      ],
    },
    watchConsecutiveSamples: profile.watchConsecutiveSamples,
    dangerConsecutiveSamples: profile.dangerConsecutiveSamples,
    downgradeStableMinutes: profile.downgradeStableMinutes,
    mismatchConsecutiveSamples: profile.mismatchConsecutiveSamples,
  };
}

async function loadRainfallHistory(
  transaction: Prisma.TransactionClient,
  device: Device,
  telemetry: Telemetry,
  profile: RiskProfile,
) {
  const site = await transaction.site.findUnique({
    where: { id: device.siteId },
    select: { timezone: true },
  });
  if (site === null) return undefined;

  const historyWindowMilliseconds =
    (profile.moderateRainfallConsecutiveDays + 2) * 24 * 60 * 60 * 1_000;
  const samples = await transaction.telemetry.findMany({
    where: {
      deviceId: device.id,
      deviceTimestamp: {
        gte: new Date(telemetry.deviceTimestamp.getTime() - historyWindowMilliseconds),
        lte: telemetry.deviceTimestamp,
      },
    },
    orderBy: [{ deviceTimestamp: 'asc' }, { id: 'asc' }],
    select: { deviceTimestamp: true, rainfallMmHour: true },
  });

  return summarizeRainfallDuration({
    samples: samples.map((sample) => ({
      timestamp: sample.deviceTimestamp,
      rainfallMmHour: sample.rainfallMmHour?.toNumber() ?? null,
    })),
    currentAt: telemetry.deviceTimestamp,
    timeZone: site.timezone,
    moderateDailyMinMm: profile.moderateRainfallDailyMinMm.toNumber(),
    moderateDailyMaxMm: profile.moderateRainfallDailyMaxMm.toNumber(),
    requiredPreviousDays: profile.moderateRainfallConsecutiveDays,
  });
}

function toEngineState(state: CurrentMonitoringPointState): RiskEngineState {
  return {
    deviceId: state.deviceId,
    profileId: state.riskProfileId,
    profileVersion: state.riskProfileVersion,
    serverRisk: state.serverRisk,
    connectivity: state.connectivityStatus,
    watchCount: state.watchConsecutiveSamples,
    dangerCount: state.dangerConsecutiveSamples,
    mismatchCount: state.mismatchConsecutiveSamples,
    pendingDowngradeRisk: state.pendingDowngradeRisk,
    pendingDowngradeSince: state.pendingDowngradeSince,
  };
}
