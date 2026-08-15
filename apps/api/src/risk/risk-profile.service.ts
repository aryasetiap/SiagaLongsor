import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';
import type { AuditRequestContext } from '../common/http/request-context.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma, type RiskProfile } from '../generated/prisma/client.js';
import type { UpdateRiskProfileDto } from './dto/risk-profile.dto.js';
import type {
  RiskProfileData,
  RiskProfileMutationResponse,
  RiskProfileResponse,
} from './risk-profile.types.js';

@Injectable()
export class RiskProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(organizationId: string, siteId: string): Promise<RiskProfileResponse> {
    await ensureSite(this.prisma, organizationId, siteId);
    const profile = await this.prisma.riskProfile.findFirst({
      where: { organizationId, siteId, isActive: true },
    });
    if (profile === null) throw profileNotFound();
    return { data: toRiskProfileData(profile) };
  }

  async replace(
    organizationId: string,
    siteId: string,
    input: UpdateRiskProfileDto,
    principal: AuthenticatedPrincipal,
    request: AuditRequestContext,
  ): Promise<RiskProfileMutationResponse> {
    validateConfiguration(input);
    const result = await this.prisma.$transaction(async (transaction) => {
      const site = await lockSite(transaction, organizationId, siteId);
      if (site === null) throw siteNotFound();
      const active = await transaction.riskProfile.findFirst({
        where: { organizationId, siteId, isActive: true },
      });
      if (active !== null && sameConfiguration(active, input)) {
        return { profile: active, changed: false };
      }

      const now = new Date();
      if (active !== null) {
        await transaction.riskProfile.update({
          where: { id: active.id },
          data: { isActive: false, deactivatedAt: now },
        });
      }
      const latest = await transaction.riskProfile.aggregate({
        where: { siteId },
        _max: { version: true },
      });
      const profile = await transaction.riskProfile.create({
        data: {
          ...toCreateData(input),
          organizationId,
          siteId,
          version: (latest._max.version ?? 0) + 1,
          activatedAt: now,
        },
      });
      await transaction.currentMonitoringPointState.updateMany({
        where: { organizationId, siteId },
        data: {
          watchConsecutiveSamples: 0,
          dangerConsecutiveSamples: 0,
          mismatchConsecutiveSamples: 0,
          pendingDowngradeRisk: null,
          pendingDowngradeSince: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorId: principal.userId,
          organizationId,
          eventType: 'RISK_PROFILE_ACTIVATED',
          entityType: 'RiskProfile',
          entityId: profile.id,
          requestId: request.requestId,
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
          metadata: {
            siteId,
            version: profile.version,
            calibrationStatus: profile.calibrationStatus,
            replacedProfileId: active?.id ?? null,
          },
        },
      });
      return { profile, changed: true };
    });

    return {
      data: { profile: toRiskProfileData(result.profile), changed: result.changed },
    };
  }
}

function validateConfiguration(input: UpdateRiskProfileDto): void {
  const failures: Array<{ field: string; messages: string[] }> = [];
  const safe = input.thresholds.safe;
  const danger = input.thresholds.danger;
  validateNumber(
    failures,
    'thresholds.safe.tiltMagnitudeDegLt',
    safe.tiltMagnitudeDegLt,
    0,
    180,
    true,
  );
  validateNumber(
    failures,
    'thresholds.safe.soilMoisturePctLt',
    safe.soilMoisturePctLt,
    0,
    100,
    true,
  );
  validateNumber(
    failures,
    'thresholds.safe.rainfallMmHourLt',
    safe.rainfallMmHourLt,
    0,
    null,
    true,
  );
  validateNumber(
    failures,
    'thresholds.danger.tiltMagnitudeDegGt',
    danger.tiltMagnitudeDegGt,
    0,
    180,
  );
  validateNumber(failures, 'thresholds.danger.soilMoisturePctGt', danger.soilMoisturePctGt, 0, 100);
  validateNumber(failures, 'thresholds.danger.rainfallMmHourGt', danger.rainfallMmHourGt, 0, null);
  for (const [name, range] of Object.entries(input.technicalRanges)) {
    if (range.maximum !== null && range.minimum >= range.maximum) {
      failures.push({
        field: `technicalRanges.${name}`,
        messages: ['minimum harus lebih kecil dari maximum.'],
      });
    }
  }
  if (input.freshness.onlineWithinMinutes >= input.freshness.offlineAfterMinutes) {
    failures.push({
      field: 'freshness',
      messages: ['onlineWithinMinutes harus lebih kecil dari offlineAfterMinutes.'],
    });
  }
  if (
    input.thresholds.safe.tiltMagnitudeDegLt > input.thresholds.danger.tiltMagnitudeDegGt ||
    input.thresholds.safe.soilMoisturePctLt > input.thresholds.danger.soilMoisturePctGt ||
    input.thresholds.safe.rainfallMmHourLt > input.thresholds.danger.rainfallMmHourGt
  ) {
    failures.push({
      field: 'thresholds',
      messages: ['Ambang WASPADA tidak boleh melampaui ambang SIAGA terkait.'],
    });
  }
  if (failures.length > 0) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Payload tidak valid.',
      details: failures,
    });
  }
}

function validateNumber(
  failures: Array<{ field: string; messages: string[] }>,
  field: string,
  value: number,
  minimum: number,
  maximum: number | null,
  exclusiveMinimum = false,
): void {
  const belowMinimum = exclusiveMinimum ? value <= minimum : value < minimum;
  if (belowMinimum || (maximum !== null && value > maximum)) {
    failures.push({ field, messages: ['Nilai berada di luar rentang kontrak.'] });
  }
}

function toCreateData(
  input: UpdateRiskProfileDto,
): Omit<Prisma.RiskProfileUncheckedCreateInput, 'organizationId' | 'siteId' | 'version'> {
  const ranges = input.technicalRanges;
  return {
    calibrationStatus: input.calibrationStatus,
    notes: input.notes,
    safeTiltMagnitudeDegLt: input.thresholds.safe.tiltMagnitudeDegLt,
    safeSoilMoisturePctLt: input.thresholds.safe.soilMoisturePctLt,
    safeRainfallMmHourLt: input.thresholds.safe.rainfallMmHourLt,
    dangerTiltMagnitudeDegGt: input.thresholds.danger.tiltMagnitudeDegGt,
    dangerRainfallMmHourGt: input.thresholds.danger.rainfallMmHourGt,
    dangerSoilMoisturePctGt: input.thresholds.danger.soilMoisturePctGt,
    technicalTiltXDegMin: ranges.tiltXDeg.minimum,
    technicalTiltXDegMax: ranges.tiltXDeg.maximum,
    technicalTiltYDegMin: ranges.tiltYDeg.minimum,
    technicalTiltYDegMax: ranges.tiltYDeg.maximum,
    technicalTiltMagnitudeMin: ranges.tiltMagnitudeDeg.minimum,
    technicalTiltMagnitudeMax: ranges.tiltMagnitudeDeg.maximum,
    technicalSoilMoistureMin: ranges.soilMoisturePct.minimum,
    technicalSoilMoistureMax: ranges.soilMoisturePct.maximum,
    technicalRainfallMin: ranges.rainfallMmHour.minimum,
    technicalRainfallMax: ranges.rainfallMmHour.maximum,
    technicalBatteryVoltageMin: ranges.batteryVoltage.minimum,
    technicalBatteryVoltageMax: ranges.batteryVoltage.maximum,
    technicalSignalRssiMin: ranges.signalRssi.minimum,
    technicalSignalRssiMax: ranges.signalRssi.maximum,
    onlineWithinMinutes: input.freshness.onlineWithinMinutes,
    offlineAfterMinutes: input.freshness.offlineAfterMinutes,
    watchConsecutiveSamples: input.hysteresis.watchConsecutiveSamples,
    dangerConsecutiveSamples: input.hysteresis.dangerConsecutiveSamples,
    downgradeStableMinutes: input.hysteresis.downgradeStableMinutes,
    mismatchConsecutiveSamples: input.hysteresis.mismatchConsecutiveSamples,
  };
}

function sameConfiguration(profile: RiskProfile, input: UpdateRiskProfileDto): boolean {
  const current = toRiskProfileData(profile);
  return (
    JSON.stringify({
      calibrationStatus: current.calibrationStatus,
      thresholds: current.thresholds,
      technicalRanges: current.technicalRanges,
      freshness: current.freshness,
      hysteresis: current.hysteresis,
      notes: current.notes,
    }) === JSON.stringify(input)
  );
}

export function toRiskProfileData(profile: RiskProfile): RiskProfileData {
  const range = (minimum: Prisma.Decimal, maximum: Prisma.Decimal | null) => ({
    minimum: minimum.toNumber(),
    maximum: maximum?.toNumber() ?? null,
  });
  return {
    id: profile.id,
    siteId: profile.siteId,
    version: profile.version,
    calibrationStatus: profile.calibrationStatus,
    thresholds: {
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
    },
    technicalRanges: {
      tiltXDeg: range(profile.technicalTiltXDegMin, profile.technicalTiltXDegMax),
      tiltYDeg: range(profile.technicalTiltYDegMin, profile.technicalTiltYDegMax),
      tiltMagnitudeDeg: range(profile.technicalTiltMagnitudeMin, profile.technicalTiltMagnitudeMax),
      soilMoisturePct: range(profile.technicalSoilMoistureMin, profile.technicalSoilMoistureMax),
      rainfallMmHour: range(profile.technicalRainfallMin, profile.technicalRainfallMax),
      batteryVoltage: range(profile.technicalBatteryVoltageMin, profile.technicalBatteryVoltageMax),
      signalRssi: range(profile.technicalSignalRssiMin, profile.technicalSignalRssiMax),
    },
    freshness: {
      onlineWithinMinutes: profile.onlineWithinMinutes,
      offlineAfterMinutes: profile.offlineAfterMinutes,
    },
    hysteresis: {
      watchConsecutiveSamples: profile.watchConsecutiveSamples,
      dangerConsecutiveSamples: profile.dangerConsecutiveSamples,
      downgradeStableMinutes: profile.downgradeStableMinutes,
      mismatchConsecutiveSamples: profile.mismatchConsecutiveSamples,
    },
    notes: profile.notes,
    createdAt: profile.createdAt.toISOString(),
    activatedAt: profile.activatedAt.toISOString(),
  };
}

async function ensureSite(
  prisma: PrismaService,
  organizationId: string,
  siteId: string,
): Promise<void> {
  if ((await prisma.site.count({ where: { id: siteId, organizationId } })) === 0) {
    throw siteNotFound();
  }
}

async function lockSite(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  siteId: string,
): Promise<{ id: string } | null> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Site"
    WHERE "id" = ${siteId} AND "organizationId" = ${organizationId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

function siteNotFound(): NotFoundException {
  return new NotFoundException({ code: 'SITE_NOT_FOUND', message: 'Site tidak ditemukan.' });
}

function profileNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'RISK_PROFILE_NOT_FOUND',
    message: 'Risk profile aktif tidak ditemukan.',
  });
}
