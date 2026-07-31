import { Injectable } from '@nestjs/common';

import { AlertObservationService } from '../alerts/alert-observation.service.js';
import { riskAlertTypes } from '../alerts/risk-alert-policy.js';
import {
  Prisma,
  type CurrentMonitoringPointState,
  type Device,
  type RiskProfile,
  type Telemetry,
} from '../generated/prisma/client.js';
import { AlertType } from '../generated/prisma/enums.js';
import { evaluateRisk } from './risk-engine.js';
import type { RiskEngineProfile, RiskEngineState } from './risk-engine.types.js';

@Injectable()
export class RiskEvaluationService {
  constructor(private readonly alerts: AlertObservationService) {}

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
    const result = evaluateRisk({
      profile: profile === null ? null : toEngineProfile(profile),
      deviceId: input.device.id,
      deviceEnabled: input.device.lifecycleStatus === 'ENABLED',
      timestampTrusted: true,
      affectsCurrentState: input.affectsCurrentState,
      evaluatedAt: input.evaluatedAt,
      telemetry: {
        tiltMagnitudeDeg: input.telemetry.tiltMagnitudeDeg.toNumber(),
        soilMoisturePct: input.telemetry.soilMoisturePct.toNumber(),
        rainfallMmHour: input.telemetry.rainfallMmHour.toNumber(),
        firmwareRisk: input.telemetry.firmwareRiskLevel,
      },
      previous: previous === null ? null : toEngineState(previous),
    });

    const assessment =
      profile === null
        ? null
        : await transaction.riskAssessment.create({
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

    if (result.nextState === null) return;
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

    if (assessment === null) return;
    const base = {
      organizationId: input.device.organizationId,
      siteId: input.device.siteId,
      monitoringPointId: input.device.monitoringPointId,
      deviceId: input.device.id,
      observedAt: input.evaluatedAt,
      riskAssessmentId: assessment.id,
      telemetryId: input.telemetry.id,
    };
    for (const type of riskAlertTypes(result)) {
      await this.alerts.observe(transaction, {
        ...base,
        type,
        reasons:
          type === AlertType.DEVICE_SERVER_MISMATCH
            ? ['DEVICE_SERVER_MISMATCH']
            : result.reasons.filter((reason) => reason !== 'DEVICE_SERVER_MISMATCH'),
        observationKey: `telemetry:${input.telemetry.id}:${type}`,
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
