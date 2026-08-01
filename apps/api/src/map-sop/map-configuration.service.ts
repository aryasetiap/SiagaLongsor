import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';
import type { AuditRequestContext } from '../common/http/request-context.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  AlertSeverity,
  AlertStatus,
  ConnectivityStatus,
  RiskLevel,
} from '../generated/prisma/enums.js';
import type { RiskReason } from '../risk/risk-engine.types.js';
import type { UpdateMapConfigurationDto } from './dto/map-sop.dto.js';
import { canonicalMapHash, normalizeMapConfiguration } from './map-configuration.validation.js';
import type {
  MapConfigurationData,
  MapConfigurationMutationResponse,
  MapConfigurationResponse,
  MapConfigurationResponseData,
  MapOverviewResponse,
} from './map-sop.types.js';

const activeMapInclude = {
  configuration: { include: { createdBy: { select: { id: true, name: true } } } },
} satisfies Prisma.ActiveSiteMapConfigurationInclude;

type ActiveMap = Prisma.ActiveSiteMapConfigurationGetPayload<{ include: typeof activeMapInclude }>;

@Injectable()
export class MapConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  async get(organizationId: string, siteId: string): Promise<MapConfigurationResponse> {
    await this.requireSite(organizationId, siteId);
    const active = await this.prisma.activeSiteMapConfiguration.findFirst({
      where: { siteId, organizationId },
      include: activeMapInclude,
    });
    if (active === null) throw mapConfigurationNotFound();
    return { data: toConfigurationResponse(active) };
  }

  async replace(
    organizationId: string,
    siteId: string,
    input: UpdateMapConfigurationDto,
    principal: AuthenticatedPrincipal,
    request: AuditRequestContext,
  ): Promise<MapConfigurationMutationResponse> {
    const normalized = normalizeMapConfiguration(input);
    const canonicalHash = canonicalMapHash(normalized);

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`phase06-map:${siteId}`}, 0))::text`,
      );
      const site = await transaction.site.findFirst({
        where: { id: siteId, organizationId },
        select: { id: true },
      });
      if (site === null) throw siteNotFound();

      const active = await transaction.activeSiteMapConfiguration.findFirst({
        where: { siteId, organizationId },
        include: activeMapInclude,
      });
      const currentVersion = active?.configuration.version ?? null;
      if (input.expectedVersion !== currentVersion) throw mapVersionConflict(currentVersion);

      await validateMonitoringPoints(transaction, organizationId, siteId, normalized);
      if (active?.configuration.canonicalHash === canonicalHash) {
        return { data: toConfigurationResponse(active), changed: false };
      }

      const version = (currentVersion ?? 0) + 1;
      const created = await transaction.siteMapConfiguration.create({
        data: {
          organizationId,
          siteId,
          version,
          configuration: normalized as unknown as Prisma.InputJsonValue,
          canonicalHash,
          createdById: principal.userId,
        },
        include: { createdBy: { select: { id: true, name: true } } },
      });
      await transaction.activeSiteMapConfiguration.upsert({
        where: { siteId },
        create: { siteId, organizationId, configurationId: created.id },
        update: { configurationId: created.id },
      });
      await transaction.auditLog.create({
        data: {
          actorId: principal.userId,
          organizationId,
          eventType: 'MAP_CONFIG_VERSION_CREATED',
          entityType: 'SiteMapConfiguration',
          entityId: created.id,
          requestId: request.requestId,
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
          metadata: {
            siteId,
            previousVersion: currentVersion,
            newVersion: version,
            monitoringPointCount: normalized.monitoringPointLocations.length,
            riskZoneCount: normalized.riskZones.length,
            evacuationRouteCount: normalized.evacuationRoutes.length,
          },
        },
      });
      return {
        data: toConfigurationResponse({
          siteId,
          organizationId,
          configurationId: created.id,
          updatedAt: created.activatedAt,
          configuration: created,
        }),
        changed: true,
      };
    });
  }

  async overview(organizationId: string, siteId: string): Promise<MapOverviewResponse> {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId },
      select: { id: true, name: true, timezone: true },
    });
    if (site === null) throw siteNotFound();

    const [activeMap, activeSop] = await Promise.all([
      this.prisma.activeSiteMapConfiguration.findFirst({
        where: { siteId, organizationId },
        include: { configuration: true },
      }),
      this.prisma.activeSiteSopDocument.findFirst({
        where: { siteId, organizationId },
        include: { document: { select: { id: true, version: true, title: true } } },
      }),
    ]);
    const configuration =
      activeMap === null ? null : mapData(activeMap.configuration.configuration);
    const locations = configuration?.monitoringPointLocations ?? [];
    const points =
      locations.length === 0
        ? []
        : await this.prisma.monitoringPoint.findMany({
            where: {
              organizationId,
              siteId,
              id: { in: locations.map((item) => item.monitoringPointId) },
            },
            include: {
              currentState: true,
              alerts: {
                where: { status: { in: [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED] } },
                select: { type: true, severity: true },
              },
            },
          });
    const pointsById = new Map(points.map((point) => [point.id, point]));

    return {
      data: {
        generatedAt: new Date().toISOString(),
        site,
        configuration: {
          configured: configuration !== null,
          version: activeMap?.configuration.version ?? null,
          center: configuration?.center ?? null,
          riskZones: configuration?.riskZones ?? [],
          evacuationRoutes: configuration?.evacuationRoutes ?? [],
        },
        markers: locations.flatMap((location) => {
          const point = pointsById.get(location.monitoringPointId);
          return point === undefined
            ? []
            : [
                {
                  monitoringPoint: {
                    id: point.id,
                    name: point.name,
                    locationDescription: point.locationDescription,
                    isActive: point.isActive,
                  },
                  position: location.position,
                  currentState: currentState(point),
                },
              ];
        }),
        sop:
          activeSop === null
            ? { available: false, documentId: null, version: null, title: null }
            : {
                available: true,
                documentId: activeSop.document.id,
                version: activeSop.document.version,
                title: activeSop.document.title,
              },
      },
    };
  }

  private async requireSite(organizationId: string, siteId: string): Promise<void> {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId },
      select: { id: true },
    });
    if (site === null) throw siteNotFound();
  }
}

async function validateMonitoringPoints(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  siteId: string,
  configuration: MapConfigurationData,
): Promise<void> {
  const ids = configuration.monitoringPointLocations.map((entry) => entry.monitoringPointId);
  if (new Set(ids).size !== ids.length) {
    throw new ConflictException({
      code: 'MONITORING_POINT_DUPLICATE',
      message: 'Monitoring point tidak boleh muncul lebih dari sekali.',
    });
  }
  if (ids.length === 0) return;
  const count = await transaction.monitoringPoint.count({
    where: { id: { in: ids }, siteId, organizationId },
  });
  if (count !== ids.length) {
    throw new NotFoundException({
      code: 'MONITORING_POINT_NOT_FOUND',
      message: 'Monitoring point tidak ditemukan pada Site ini.',
    });
  }
}

function toConfigurationResponse(active: ActiveMap): MapConfigurationResponseData {
  const row = active.configuration;
  return {
    id: row.id,
    siteId: row.siteId,
    version: row.version,
    ...mapData(row.configuration),
    createdAt: row.createdAt.toISOString(),
    activatedAt: row.activatedAt.toISOString(),
    createdBy: row.createdBy,
  };
}

function mapData(value: Prisma.JsonValue): MapConfigurationData {
  return value as unknown as MapConfigurationData;
}

function currentState(point: {
  readonly id: string;
  readonly updatedAt: Date;
  readonly currentState: {
    readonly deviceId: string | null;
    readonly serverRisk: RiskLevel;
    readonly connectivityStatus: ConnectivityStatus;
    readonly reasons: Prisma.JsonValue;
    readonly latestTelemetryId: string | null;
    readonly evaluatedAt: Date;
    readonly lastTelemetryAt: Date | null;
    readonly riskProfileId: string | null;
    readonly riskProfileVersion: number | null;
  } | null;
  readonly alerts: readonly {
    readonly type: import('../generated/prisma/enums.js').AlertType;
    readonly severity: AlertSeverity;
  }[];
}): NonNullable<MapOverviewResponse['data']['markers'][number]['currentState']> | null {
  const state = point.currentState;
  if (state === null) return null;
  const unsafeSafe =
    state.serverRisk === RiskLevel.SAFE && state.connectivityStatus !== ConnectivityStatus.ONLINE;
  const severity = point.alerts.map((alert) => alert.severity);
  return {
    monitoringPointId: point.id,
    deviceId: state.deviceId,
    serverRisk: unsafeSafe ? RiskLevel.UNKNOWN : state.serverRisk,
    connectivityStatus: state.connectivityStatus,
    reasons: unsafeSafe
      ? [
          state.connectivityStatus === ConnectivityStatus.OFFLINE
            ? 'DEVICE_OFFLINE'
            : 'TELEMETRY_DELAYED',
        ]
      : (state.reasons as RiskReason[]),
    latestTelemetryId: state.latestTelemetryId,
    evaluatedAt: state.evaluatedAt.toISOString(),
    lastTelemetryAt: state.lastTelemetryAt?.toISOString() ?? null,
    profileId: state.riskProfileId,
    profileVersion: state.riskProfileVersion,
    activeAlertSummary: {
      count: point.alerts.length,
      highestSeverity: severity.includes(AlertSeverity.CRITICAL)
        ? AlertSeverity.CRITICAL
        : severity.includes(AlertSeverity.WARNING)
          ? AlertSeverity.WARNING
          : severity.includes(AlertSeverity.INFO)
            ? AlertSeverity.INFO
            : null,
      types: [...new Set(point.alerts.map((alert) => alert.type))],
    },
  };
}

function siteNotFound(): NotFoundException {
  return new NotFoundException({ code: 'SITE_NOT_FOUND', message: 'Site tidak ditemukan.' });
}

function mapConfigurationNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'MAP_CONFIG_NOT_FOUND',
    message: 'Konfigurasi peta belum tersedia.',
  });
}

function mapVersionConflict(currentVersion: number | null): ConflictException {
  return new ConflictException({
    code: 'MAP_CONFIG_VERSION_CONFLICT',
    message: 'Konfigurasi peta telah berubah. Muat ulang sebelum menyimpan.',
    details: { currentVersion },
  });
}
