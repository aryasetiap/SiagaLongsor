import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';
import type { RequestWithContext } from '../common/http/request-context.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma, type AuditLog, type RiskProfile } from '../generated/prisma/client.js';
import { DeviceLifecycleStatus } from '../generated/prisma/enums.js';
import type { AuditQueryDto, OverviewQueryDto, SingleRiskProfileDto } from './single-device.dto.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MAX_OVERVIEW_RANGE = 31 * DAY;
const contextDeviceInclude = {
  site: {
    include: { riskProfiles: { where: { isActive: true }, orderBy: { version: 'desc' }, take: 2 } },
  },
} satisfies Prisma.DeviceInclude;
type ContextDevice = Prisma.DeviceGetPayload<{ include: typeof contextDeviceInclude }>;
interface OverviewSeriesRow {
  readonly deviceTimestamp: Date;
  readonly tiltMagnitudeDeg: Prisma.Decimal | null;
  readonly soilMoisturePct: Prisma.Decimal | null;
  readonly rainfallMmHour: Prisma.Decimal | null;
}
interface SingleDeviceContext extends ContextDevice {
  readonly profile: RiskProfile | null;
}
type AuditMetadata = {
  readonly previousStatus: string;
  readonly currentStatus: string;
  readonly reasons: readonly string[];
  readonly telemetryId: string | null;
  readonly riskProfileId: string | null;
  readonly riskProfileVersion: number | null;
  readonly sensorSnapshot: {
    readonly tiltMagnitudeDeg: number | null;
    readonly soilMoisturePct: number | null;
    readonly rainfallMmHour: number | null;
  };
  readonly occurredAt: string;
};

@Injectable()
export class SingleDeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursors: SignedCursorService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async overview(query: OverviewQueryDto) {
    const context = await this.resolvePublic(false);
    const now = new Date();
    const range = rangeOf(query, now);
    if (context === null)
      return {
        data: {
          generatedAt: now.toISOString(),
          configured: false,
          risk: {
            status: 'UNKNOWN',
            reasons: ['DEVICE_NOT_CONFIGURED'],
            observedAt: null,
            freshness: 'UNAVAILABLE',
          },
          readings: emptyReadings(),
          series: emptySeries(),
          thresholds: null,
          range: {
            from: range.from.toISOString(),
            to: range.to.toISOString(),
          },
        },
      };
    const [state, rows] = await Promise.all([
      this.prisma.currentMonitoringPointState.findUnique({
        where: { monitoringPointId: context.monitoringPointId },
        include: { latestTelemetry: true },
      }),
      this.overviewSeries(context.id, range.from, range.to),
    ]);
    const telemetry = state?.latestTelemetry ?? null;
    const freshness = freshnessOf(
      telemetry?.serverReceivedAt ?? null,
      context.profile?.onlineWithinMinutes ?? null,
      context.profile?.offlineAfterMinutes ?? null,
      now,
    );
    const trusted = freshness === 'ONLINE' && telemetry !== null && state !== null;
    const unavailableReasons =
      context.profile === null
        ? ['PROFILE_UNAVAILABLE']
        : freshness === 'OFFLINE'
          ? ['DEVICE_OFFLINE']
          : freshness === 'DELAYED'
            ? ['TELEMETRY_DELAYED']
            : ['TELEMETRY_UNAVAILABLE'];
    return {
      data: {
        generatedAt: now.toISOString(),
        configured: true,
        risk: {
          status: trusted ? state.serverRisk : 'UNKNOWN',
          reasons: trusted ? state.reasons : unavailableReasons,
          observedAt: telemetry?.deviceTimestamp.toISOString() ?? null,
          freshness,
        },
        readings:
          telemetry === null
            ? emptyReadings()
            : {
                tiltMagnitudeDeg: telemetry.tiltMagnitudeDeg?.toNumber() ?? null,
                soilMoisturePct: telemetry.soilMoisturePct?.toNumber() ?? null,
                rainfallMmHour: telemetry.rainfallMmHour?.toNumber() ?? null,
              },
        series: {
          tiltMagnitudeDeg: rows.map((x) => point(x.deviceTimestamp, x.tiltMagnitudeDeg)),
          soilMoisturePct: rows.map((x) => point(x.deviceTimestamp, x.soilMoisturePct)),
          rainfallMmHour: rows.map((x) => point(x.deviceTimestamp, x.rainfallMmHour)),
        },
        thresholds: publicThresholds(context.profile),
        range: { from: range.from.toISOString(), to: range.to.toISOString() },
      },
    };
  }

  private async overviewSeries(
    deviceId: string,
    from: Date,
    to: Date,
  ): Promise<readonly OverviewSeriesRow[]> {
    const duration = to.getTime() - from.getTime();
    if (duration <= DAY)
      return this.prisma.telemetry.findMany({
        where: { deviceId, deviceTimestamp: { gte: from, lt: to } },
        orderBy: [{ deviceTimestamp: 'asc' }, { id: 'asc' }],
        select: {
          deviceTimestamp: true,
          tiltMagnitudeDeg: true,
          soilMoisturePct: true,
          rainfallMmHour: true,
        },
      });

    const bucketMinutes = duration <= 7 * DAY ? 15 : 60;
    const rows = await this.prisma.$queryRaw<OverviewSeriesRow[]>(Prisma.sql`
      SELECT
        date_bin(
          make_interval(mins => ${bucketMinutes}::int),
          "deviceTimestamp",
          ${from}
        ) AS "deviceTimestamp",
        AVG("tiltMagnitudeDeg") AS "tiltMagnitudeDeg",
        AVG("soilMoisturePct") AS "soilMoisturePct",
        AVG("rainfallMmHour") AS "rainfallMmHour"
      FROM "Telemetry"
      WHERE "deviceId" = ${deviceId}
        AND "deviceTimestamp" >= ${from}
        AND "deviceTimestamp" < ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
    return fillOverviewBuckets(rows, from, to, bucketMinutes);
  }

  async device(principal: AuthenticatedPrincipal) {
    const context = await this.resolve(principal, false);
    if (context === null)
      return {
        data: {
          configured: false,
          hardwareId: null,
          displayName: null,
          firmwareVersion: null,
          connectivity: 'UNKNOWN',
          lastSeenAt: null,
          lastTelemetryAt: null,
          network: null,
          batteryVoltage: null,
          sensors: sensors('UNKNOWN'),
        },
      };
    const state = await this.prisma.currentMonitoringPointState.findUnique({
      where: {
        monitoringPointId: context.monitoringPointId,
      },
      include: {
        latestTelemetry: true,
      },
    });

    const latest = state?.latestTelemetry ?? null;
    const connectivity = freshnessOf(
      latest?.serverReceivedAt ?? null,
      context.profile?.onlineWithinMinutes ?? null,
      context.profile?.offlineAfterMinutes ?? null,
      new Date(),
    );
    const status = (value: Prisma.Decimal | null | undefined) =>
      connectivity !== 'ONLINE'
        ? 'UNKNOWN'
        : value === null || value === undefined
          ? 'UNREADABLE'
          : 'READABLE';
    return {
      data: {
        configured: true,
        hardwareId: context.hardwareId,
        displayName: context.displayName,
        firmwareVersion: context.firmwareVersion,
        connectivity,
        lastSeenAt: context.lastSeenAt?.toISOString() ?? null,
        lastTelemetryAt: context.lastTelemetryAt?.toISOString() ?? null,
        network:
          context.lastNetworkType === null
            ? null
            : {
                type: context.lastNetworkType,
                signalRssi: context.lastSignalRssi?.toNumber() ?? null,
              },
        batteryVoltage:
          connectivity === 'ONLINE' ? (latest?.batteryVoltage?.toNumber() ?? null) : null,
        sensors: {
          tilt: status(latest?.tiltMagnitudeDeg),
          soilMoisture: status(latest?.soilMoisturePct),
          rainfall: status(latest?.rainfallMmHour),
        },
      },
    };
  }

  async profile(principal: AuthenticatedPrincipal) {
    const c = await this.resolve(principal);
    const profile = requireProfile(c.profile);

    return {
      data: mapProfile(profile),
    };
  }
  async updateProfile(
    principal: AuthenticatedPrincipal,
    input: SingleRiskProfileDto,
    request: RequestWithContext,
  ) {
    const c = await this.resolve(principal);

    const result = await this.prisma.$transaction(async (tx) => {
      await lockSiteForRiskProfileUpdate(tx, c.organizationId, c.siteId);

      const activeProfiles = await tx.riskProfile.findMany({
        where: {
          organizationId: c.organizationId,
          siteId: c.siteId,
          isActive: true,
        },
        orderBy: {
          version: 'desc',
        },
        take: 2,
      });

      if (activeProfiles.length === 0) {
        throw new NotFoundException({
          code: 'RISK_PROFILE_UNAVAILABLE',
          message: 'Profil risiko aktif belum tersedia.',
        });
      }

      if (activeProfiles.length > 1) {
        throw new ConflictException({
          code: 'RISK_PROFILE_CONTEXT_AMBIGUOUS',
          message: 'Lebih dari satu profil risiko aktif ditemukan.',
        });
      }

      const active = activeProfiles[0]!;

      validate(input, active);

      if (same(input, active)) {
        return {
          profile: active,
          changed: false,
        };
      }

      const now = new Date();

      await tx.riskProfile.update({
        where: {
          id: active.id,
        },
        data: {
          isActive: false,
          deactivatedAt: now,
        },
      });

      const max = await tx.riskProfile.aggregate({
        where: {
          organizationId: c.organizationId,
          siteId: c.siteId,
        },
        _max: {
          version: true,
        },
      });

      const profile = await tx.riskProfile.create({
        data: {
          ...clone(active, input),
          organizationId: c.organizationId,
          siteId: c.siteId,
          version: (max._max.version ?? 0) + 1,
          activatedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: c.organizationId,
          actorId: principal.userId,
          eventType: 'RISK_PROFILE_ACTIVATED',
          entityType: 'RiskProfile',
          entityId: profile.id,
          requestId: request.requestId,
          ipAddress: request.ip ?? null,
          userAgent: request.get('user-agent') ?? null,
          metadata: {
            siteId: c.siteId,
            version: profile.version,
            calibrationStatus: profile.calibrationStatus,
            replacedProfileId: active.id,
          },
        },
      });

      return {
        profile,
        changed: true,
      };
    });

    return {
      data: {
        profile: mapProfile(result.profile),
        changed: result.changed,
      },
    };
  }

  async audit(principal: AuthenticatedPrincipal, query: AuditQueryDto) {
    const c = await this.resolve(principal);

    const cursorContext = {
      endpoint: 'single-device-audit-log',
      organizationId: c.organizationId,
      eventType: 'RISK_STATUS_CHANGED',
    };

    const boundary =
      query.cursor === undefined ? null : this.cursors.decode(query.cursor, cursorContext);

    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId: c.organizationId,
        eventType: 'RISK_STATUS_CHANGED',
        ...(boundary === null
          ? {}
          : {
              OR: [
                {
                  createdAt: {
                    lt: new Date(String(boundary.value)),
                  },
                },
                {
                  createdAt: new Date(String(boundary.value)),
                  id: {
                    lt: boundary.id,
                  },
                },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });

    const hasMore = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);

    return {
      data: pageRows.map((row) => typedAudit(row)),
      page: {
        hasMore,
        nextCursor:
          hasMore && last !== undefined
            ? this.cursors.encode(cursorContext, {
                id: last.id,
                value: last.createdAt.toISOString(),
              })
            : null,
      },
    };
  }

  private async resolve(principal: AuthenticatedPrincipal): Promise<SingleDeviceContext>;
  private async resolve(
    principal: AuthenticatedPrincipal,
    required: false,
  ): Promise<SingleDeviceContext | null>;
  private async resolve(
    principal: AuthenticatedPrincipal,
    required = true,
  ): Promise<SingleDeviceContext | null> {
    const orgs = principal.memberships
      .filter((m) => m.role === 'PROJECT_OWNER')
      .map((m) => m.organizationId);
    const devices = await this.prisma.device.findMany({
      where: {
        organizationId: { in: orgs },
        lifecycleStatus: DeviceLifecycleStatus.ENABLED,
        monitoringPoint: { isActive: true },
      },
      include: contextDeviceInclude,
    });
    return singleDeviceContext(devices, required);
  }

  private async resolvePublic(required: false): Promise<SingleDeviceContext | null>;
  private async resolvePublic(required?: true): Promise<SingleDeviceContext>;
  private async resolvePublic(required = true): Promise<SingleDeviceContext | null> {
    const devices = await this.prisma.device.findMany({
      where: {
        ...(this.config.publicDashboard.hardwareId === null
          ? {}
          : { hardwareId: this.config.publicDashboard.hardwareId }),
        lifecycleStatus: DeviceLifecycleStatus.ENABLED,
        monitoringPoint: { isActive: true },
      },
      include: contextDeviceInclude,
    });
    return singleDeviceContext(devices, required);
  }
}
function singleDeviceContext(
  devices: readonly ContextDevice[],
  required: boolean,
): SingleDeviceContext | null {
  if (devices.length > 1)
    throw new ConflictException({
      code: 'SINGLE_DEVICE_CONTEXT_AMBIGUOUS',
      message: 'Lebih dari satu device deployment aktif ditemukan.',
    });
  if (devices.length === 0) {
    if (required)
      throw new NotFoundException({
        code: 'SINGLE_DEVICE_CONTEXT_UNAVAILABLE',
        message: 'Device deployment belum dikonfigurasi.',
      });
    return null;
  }
  const device = devices[0]!;
  if (device.site.riskProfiles.length > 1) {
    throw new ConflictException({
      code: 'RISK_PROFILE_CONTEXT_AMBIGUOUS',
      message: 'Lebih dari satu profil risiko aktif ditemukan.',
    });
  }
  return {
    ...device,
    profile: device.site.riskProfiles[0] ?? null,
  };
}
function emptyReadings() {
  return { tiltMagnitudeDeg: null, soilMoisturePct: null, rainfallMmHour: null };
}
function emptySeries() {
  return { tiltMagnitudeDeg: [], soilMoisturePct: [], rainfallMmHour: [] };
}
function publicThresholds(profile: RiskProfile | null) {
  if (profile === null) return null;
  const mapped = mapProfile(profile);
  return {
    tiltMagnitudeDeg: mapped.tiltMagnitudeDeg,
    soilMoisturePct: mapped.soilMoisturePct,
    rainfallMmHour: mapped.rainfallMmHour,
  };
}
function point(timestamp: Date, value: Prisma.Decimal | null) {
  return { timestamp: timestamp.toISOString(), value: value?.toNumber() ?? null };
}
function sensors(state: string) {
  return { tilt: state, soilMoisture: state, rainfall: state };
}
function rangeOf(q: OverviewQueryDto, now: Date) {
  const to = q.to === undefined ? now : new Date(q.to);
  const from = q.from === undefined ? new Date(to.getTime() - 24 * HOUR) : new Date(q.from);
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from >= to ||
    to.getTime() - from.getTime() > MAX_OVERVIEW_RANGE
  )
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Rentang Overview tidak valid.',
    });
  return { from, to };
}

function fillOverviewBuckets(
  rows: readonly OverviewSeriesRow[],
  from: Date,
  to: Date,
  bucketMinutes: number,
): readonly OverviewSeriesRow[] {
  const interval = bucketMinutes * 60_000;
  const byTimestamp = new Map(rows.map((row) => [row.deviceTimestamp.getTime(), row]));
  const result: OverviewSeriesRow[] = [];
  for (let timestamp = from.getTime(); timestamp < to.getTime(); timestamp += interval) {
    result.push(
      byTimestamp.get(timestamp) ?? {
        deviceTimestamp: new Date(timestamp),
        tiltMagnitudeDeg: null,
        soilMoisturePct: null,
        rainfallMmHour: null,
      },
    );
  }
  return result;
}
function freshnessOf(
  received: Date | null,
  online: number | null,
  offline: number | null,
  now: Date,
) {
  if (received === null || online === null || offline === null) return 'UNKNOWN';
  const age = now.getTime() - received.getTime();
  if (age <= online * 60_000) return 'ONLINE';
  return age < offline * 60_000 ? 'DELAYED' : 'OFFLINE';
}
function mapProfile(p: RiskProfile) {
  return {
    version: p.version,
    calibrationStatus: p.calibrationStatus,
    activatedAt: p.activatedAt.toISOString(),
    notes: p.notes,
    tiltMagnitudeDeg: {
      watch: p.safeTiltMagnitudeDegLt.toNumber(),
      danger: p.dangerTiltMagnitudeDegGt.toNumber(),
    },
    soilMoisturePct: {
      watch: p.safeSoilMoisturePctLt.toNumber(),
      danger: p.dangerSoilMoisturePctGt.toNumber(),
    },
    rainfallMmHour: {
      watch: p.safeRainfallMmHourLt.toNumber(),
      danger: p.dangerRainfallMmHourGt.toNumber(),
    },
    rainfallDuration: {
      moderateDailyMinMm: p.moderateRainfallDailyMinMm.toNumber(),
      moderateDailyMaxMm: p.moderateRainfallDailyMaxMm.toNumber(),
      consecutiveDays: p.moderateRainfallConsecutiveDays,
      continuationRainfallMmHourGt: p.rainfallContinuationMmHourGt.toNumber(),
    },
  };
}
type HazardSensorKey = 'tiltMagnitudeDeg' | 'soilMoisturePct' | 'rainfallMmHour';

function validate(i: SingleRiskProfileDto, p: RiskProfile): void {
  const limits: Record<HazardSensorKey, readonly [number, number | null]> = {
    tiltMagnitudeDeg: [
      p.technicalTiltMagnitudeMin.toNumber(),
      p.technicalTiltMagnitudeMax?.toNumber() ?? null,
    ],
    soilMoisturePct: [
      p.technicalSoilMoistureMin.toNumber(),
      p.technicalSoilMoistureMax?.toNumber() ?? null,
    ],
    rainfallMmHour: [p.technicalRainfallMin.toNumber(), p.technicalRainfallMax?.toNumber() ?? null],
  };

  const keys: readonly HazardSensorKey[] = [
    'tiltMagnitudeDeg',
    'soilMoisturePct',
    'rainfallMmHour',
  ];

  for (const key of keys) {
    const threshold = i[key];
    const [minimum, maximum] = limits[key];

    if (
      !Number.isFinite(threshold.watch) ||
      !Number.isFinite(threshold.danger) ||
      threshold.watch < minimum ||
      threshold.danger < minimum ||
      (maximum !== null && (threshold.watch > maximum || threshold.danger > maximum)) ||
      threshold.watch >= threshold.danger
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'WATCH harus lebih rendah dari DANGER dan berada dalam rentang teknis.',
      });
    }
  }

  const duration = i.rainfallDuration;
  if (
    duration !== undefined &&
    (!Number.isFinite(duration.moderateDailyMinMm) ||
      !Number.isFinite(duration.moderateDailyMaxMm) ||
      duration.moderateDailyMinMm < 0 ||
      duration.moderateDailyMinMm >= duration.moderateDailyMaxMm ||
      !Number.isInteger(duration.consecutiveDays) ||
      duration.consecutiveDays < 1 ||
      duration.consecutiveDays > 30 ||
      !Number.isFinite(duration.continuationRainfallMmHourGt) ||
      duration.continuationRainfallMmHourGt < 0)
  ) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Konfigurasi durasi curah hujan tidak valid.',
    });
  }
}
function same(i: SingleRiskProfileDto, p: RiskProfile): boolean {
  const x = mapProfile(p);
  const keys: readonly HazardSensorKey[] = [
    'tiltMagnitudeDeg',
    'soilMoisturePct',
    'rainfallMmHour',
  ];
  return (
    keys.every((k) => i[k].watch === x[k].watch && i[k].danger === x[k].danger) &&
    (i.rainfallDuration === undefined ||
      JSON.stringify(i.rainfallDuration) === JSON.stringify(x.rainfallDuration)) &&
    (i.calibrationStatus ?? p.calibrationStatus) === p.calibrationStatus &&
    (i.notes === undefined ? p.notes : i.notes) === p.notes
  );
}
function clone(
  p: RiskProfile,
  i: SingleRiskProfileDto,
): Omit<Prisma.RiskProfileUncheckedCreateInput, 'organizationId' | 'siteId' | 'version'> {
  return {
    calibrationStatus: i.calibrationStatus ?? p.calibrationStatus,
    notes: i.notes === undefined ? p.notes : i.notes,
    safeTiltMagnitudeDegLt: i.tiltMagnitudeDeg.watch,
    dangerTiltMagnitudeDegGt: i.tiltMagnitudeDeg.danger,
    safeSoilMoisturePctLt: i.soilMoisturePct.watch,
    dangerSoilMoisturePctGt: i.soilMoisturePct.danger,
    safeRainfallMmHourLt: i.rainfallMmHour.watch,
    dangerRainfallMmHourGt: i.rainfallMmHour.danger,
    moderateRainfallDailyMinMm:
      i.rainfallDuration?.moderateDailyMinMm ?? p.moderateRainfallDailyMinMm,
    moderateRainfallDailyMaxMm:
      i.rainfallDuration?.moderateDailyMaxMm ?? p.moderateRainfallDailyMaxMm,
    moderateRainfallConsecutiveDays:
      i.rainfallDuration?.consecutiveDays ?? p.moderateRainfallConsecutiveDays,
    rainfallContinuationMmHourGt:
      i.rainfallDuration?.continuationRainfallMmHourGt ?? p.rainfallContinuationMmHourGt,
    technicalTiltXDegMin: p.technicalTiltXDegMin,
    technicalTiltXDegMax: p.technicalTiltXDegMax,
    technicalTiltYDegMin: p.technicalTiltYDegMin,
    technicalTiltYDegMax: p.technicalTiltYDegMax,
    technicalTiltMagnitudeMin: p.technicalTiltMagnitudeMin,
    technicalTiltMagnitudeMax: p.technicalTiltMagnitudeMax,
    technicalSoilMoistureMin: p.technicalSoilMoistureMin,
    technicalSoilMoistureMax: p.technicalSoilMoistureMax,
    technicalRainfallMin: p.technicalRainfallMin,
    technicalRainfallMax: p.technicalRainfallMax,
    technicalBatteryVoltageMin: p.technicalBatteryVoltageMin,
    technicalBatteryVoltageMax: p.technicalBatteryVoltageMax,
    technicalSignalRssiMin: p.technicalSignalRssiMin,
    technicalSignalRssiMax: p.technicalSignalRssiMax,
    onlineWithinMinutes: p.onlineWithinMinutes,
    offlineAfterMinutes: p.offlineAfterMinutes,
    watchConsecutiveSamples: p.watchConsecutiveSamples,
    dangerConsecutiveSamples: p.dangerConsecutiveSamples,
    downgradeStableMinutes: p.downgradeStableMinutes,
    mismatchConsecutiveSamples: p.mismatchConsecutiveSamples,
  };
}
function typedAudit(x: AuditLog) {
  const m = parseAuditMetadata(x.metadata, x.createdAt);
  return {
    id: x.id,
    previousStatus: m.previousStatus,
    currentStatus: m.currentStatus,
    reasons: m.reasons,
    sensorSnapshot: m.sensorSnapshot,
    riskProfile: { id: m.riskProfileId, version: m.riskProfileVersion },
    telemetryId: m.telemetryId,
    occurredAt: m.occurredAt,
  };
}
function parseAuditMetadata(value: Prisma.JsonValue, fallback: Date): AuditMetadata {
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Metadata audit tidak valid.',
    });
  const data = value as Record<string, Prisma.JsonValue>;
  const status = (key: string) => (typeof data[key] === 'string' ? data[key] : 'UNKNOWN');
  const maybeString = (key: string) => (typeof data[key] === 'string' ? data[key] : null);
  const maybeNumber = (key: string) =>
    typeof data[key] === 'number' && Number.isFinite(data[key]) ? data[key] : null;
  const snapshotValue = data.sensorSnapshot;
  const snapshot =
    snapshotValue !== null && !Array.isArray(snapshotValue) && typeof snapshotValue === 'object'
      ? (snapshotValue as Record<string, Prisma.JsonValue>)
      : {};
  const numberOrNull = (key: string) =>
    typeof snapshot[key] === 'number' && Number.isFinite(snapshot[key]) ? snapshot[key] : null;
  return {
    previousStatus: status('previousStatus'),
    currentStatus: status('currentStatus'),
    reasons: Array.isArray(data.reasons)
      ? data.reasons.filter((reason): reason is string => typeof reason === 'string')
      : [],
    telemetryId: maybeString('telemetryId'),
    riskProfileId: maybeString('riskProfileId'),
    riskProfileVersion: maybeNumber('riskProfileVersion'),
    sensorSnapshot: {
      tiltMagnitudeDeg: numberOrNull('tiltMagnitudeDeg'),
      soilMoisturePct: numberOrNull('soilMoisturePct'),
      rainfallMmHour: numberOrNull('rainfallMmHour'),
    },
    occurredAt: typeof data.occurredAt === 'string' ? data.occurredAt : fallback.toISOString(),
  };
}
async function lockSiteForRiskProfileUpdate(
  tx: Prisma.TransactionClient,
  organizationId: string,
  siteId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "Site"
    WHERE "id" = ${siteId}
      AND "organizationId" = ${organizationId}
    FOR UPDATE
  `);

  if (rows.length === 0) {
    throw new NotFoundException({
      code: 'SINGLE_DEVICE_CONTEXT_UNAVAILABLE',
      message: 'Konteks perangkat tunggal tidak tersedia.',
    });
  }
}
function requireProfile<T>(profile: T | null): T {
  if (profile === null) {
    throw new NotFoundException({
      code: 'RISK_PROFILE_UNAVAILABLE',
      message: 'Profil risiko aktif belum tersedia.',
    });
  }

  return profile;
}
