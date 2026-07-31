import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';
import type { AuditRequestContext } from '../common/http/request-context.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma, type Device } from '../generated/prisma/client.js';
import { DeviceLifecycleStatus } from '../generated/prisma/enums.js';
import { type DeviceCursorBoundary, DeviceCursorService } from './device-cursor.service.js';
import { DeviceCredentialService, type IssuedDeviceSecret } from './device-credential.service.js';
import {
  DeviceSort,
  type ListDevicesQueryDto,
  type RegisterDeviceDto,
  type UpdateDeviceDto,
} from './dto/device.dto.js';
import type {
  DeviceCredentialResponse,
  DeviceListResponse,
  DeviceResponse,
  DeviceResponseData,
} from './devices.types.js';

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: DeviceCredentialService,
    private readonly cursors: DeviceCursorService,
  ) {}

  async list(organizationId: string, query: ListDevicesQueryDto): Promise<DeviceListResponse> {
    const cursor =
      query.cursor === undefined ? null : this.cursors.decode(query.cursor, organizationId, query);
    const sort = sortDefinition(query.sort);
    const baseWhere: Prisma.DeviceWhereInput = {
      organizationId,
      ...(query.siteId === undefined ? {} : { siteId: query.siteId }),
      ...(query.monitoringPointId === undefined
        ? {}
        : { monitoringPointId: query.monitoringPointId }),
      ...(query.lifecycleStatus === undefined ? {} : { lifecycleStatus: query.lifecycleStatus }),
      ...(query.search === undefined
        ? {}
        : {
            OR: [
              { hardwareId: { contains: query.search, mode: 'insensitive' } },
              { displayName: { contains: query.search, mode: 'insensitive' } },
            ],
          }),
    };
    const where: Prisma.DeviceWhereInput =
      cursor === null ? baseWhere : { AND: [baseWhere, cursorWhere(sort, cursor)] };
    const rows = await this.prisma.device.findMany({
      where,
      orderBy: orderBy(sort),
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows.at(-1);

    return {
      data: pageRows.map(toResponseData),
      page: {
        hasMore,
        nextCursor:
          hasMore && last !== undefined
            ? this.cursors.encode(organizationId, query, cursorBoundary(sort.field, last))
            : null,
      },
    };
  }

  async register(
    organizationId: string,
    input: RegisterDeviceDto,
    principal: AuthenticatedPrincipal,
    request: AuditRequestContext,
  ): Promise<DeviceCredentialResponse> {
    const issued = await this.credentials.issue();

    try {
      const device = await this.prisma.$transaction(async (transaction) => {
        const point = await lockMonitoringPoint(
          transaction,
          organizationId,
          input.monitoringPointId,
        );
        if (point === null || !point.isActive) throw monitoringPointNotFound();

        if (
          (await transaction.device.count({
            where: {
              monitoringPointId: point.id,
              lifecycleStatus: DeviceLifecycleStatus.ENABLED,
            },
          })) > 0
        ) {
          throw monitoringPointOccupied();
        }
        if (
          (await transaction.device.findUnique({ where: { hardwareId: input.hardwareId } })) !==
          null
        ) {
          throw hardwareIdConflict();
        }

        const created = await transaction.device.create({
          data: {
            organizationId,
            siteId: point.siteId,
            monitoringPointId: point.id,
            hardwareId: input.hardwareId,
            displayName: input.displayName,
            lifecycleStatus: DeviceLifecycleStatus.ENABLED,
            credentialHash: issued.hash,
            credentialRotatedAt: issued.issuedAt,
          },
        });
        await transaction.auditLog.create({
          data: auditData({
            eventType: 'DEVICE_REGISTERED',
            device: created,
            organizationId,
            principal,
            request,
            metadata: {
              hardwareId: created.hardwareId,
              monitoringPointId: created.monitoringPointId,
              lifecycleStatus: created.lifecycleStatus,
            },
          }),
        });
        return created;
      });

      return credentialResponse(device, issued);
    } catch (error) {
      if (error instanceof ConflictException || error instanceof NotFoundException) throw error;
      if (isUniqueConstraint(error)) {
        const hardwareExists =
          (await this.prisma.device.findUnique({ where: { hardwareId: input.hardwareId } })) !==
          null;
        throw hardwareExists ? hardwareIdConflict() : monitoringPointOccupied();
      }
      throw error;
    }
  }

  async get(organizationId: string, deviceId: string): Promise<DeviceResponse> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
    });
    if (device === null) throw deviceNotFound();
    return { data: toResponseData(device) };
  }

  async update(
    organizationId: string,
    deviceId: string,
    input: UpdateDeviceDto,
    principal: AuthenticatedPrincipal,
    request: AuditRequestContext,
  ): Promise<DeviceResponse> {
    if (input.displayName === undefined && input.monitoringPointId === undefined) {
      throw emptyPayload();
    }

    const device = await this.prisma.$transaction(async (transaction) => {
      const existing = await lockDevice(transaction, organizationId, deviceId);
      if (existing === null) throw deviceNotFound();

      let targetSiteId = existing.siteId;
      if (
        input.monitoringPointId !== undefined &&
        input.monitoringPointId !== existing.monitoringPointId
      ) {
        const target = await lockMonitoringPoint(
          transaction,
          organizationId,
          input.monitoringPointId,
        );
        if (target === null || !target.isActive) throw monitoringPointNotFound();
        if (
          (await transaction.device.count({
            where: {
              monitoringPointId: target.id,
              lifecycleStatus: DeviceLifecycleStatus.ENABLED,
              id: { not: existing.id },
            },
          })) > 0
        ) {
          throw monitoringPointOccupied();
        }
        targetSiteId = target.siteId;
      }

      const changes: Prisma.DeviceUpdateInput = {};
      if (input.displayName !== undefined && input.displayName !== existing.displayName) {
        changes.displayName = input.displayName;
      }
      if (
        input.monitoringPointId !== undefined &&
        input.monitoringPointId !== existing.monitoringPointId
      ) {
        changes.monitoringPoint = { connect: { id: input.monitoringPointId } };
        changes.site = { connect: { id: targetSiteId } };
      }
      if (Object.keys(changes).length === 0) return existing;

      const updated = await transaction.device.update({
        where: { id: existing.id },
        data: changes,
      });
      if (
        input.monitoringPointId !== undefined &&
        input.monitoringPointId !== existing.monitoringPointId
      ) {
        const movedAt = new Date();
        await transaction.currentMonitoringPointState.updateMany({
          where: { monitoringPointId: existing.monitoringPointId, deviceId: existing.id },
          data: {
            deviceId: null,
            serverRisk: 'UNKNOWN',
            connectivityStatus: 'UNKNOWN',
            reasons: ['REQUIRED_SENSOR_MISSING'],
            latestTelemetryId: null,
            lastTelemetryAt: null,
            evaluatedAt: movedAt,
            watchConsecutiveSamples: 0,
            dangerConsecutiveSamples: 0,
            mismatchConsecutiveSamples: 0,
            pendingDowngradeRisk: null,
            pendingDowngradeSince: null,
          },
        });
      }
      await transaction.auditLog.create({
        data: auditData({
          eventType: 'DEVICE_UPDATED',
          device: updated,
          organizationId,
          principal,
          request,
          metadata: {
            changedFields: Object.keys(changes),
            before: mutableSnapshot(existing),
            after: mutableSnapshot(updated),
          },
        }),
      });
      return updated;
    });

    return { data: toResponseData(device) };
  }

  async rotateCredential(
    organizationId: string,
    deviceId: string,
    principal: AuthenticatedPrincipal,
    request: AuditRequestContext,
  ): Promise<DeviceCredentialResponse> {
    const issued = await this.credentials.issue();
    const device = await this.prisma.$transaction(async (transaction) => {
      const existing = await lockDevice(transaction, organizationId, deviceId);
      if (existing === null) throw deviceNotFound();
      if (existing.lifecycleStatus !== DeviceLifecycleStatus.ENABLED) {
        throw new ForbiddenException({
          code: 'DEVICE_DISABLED',
          message: 'Credential device nonaktif tidak dapat dirotasi.',
        });
      }

      const updated = await transaction.device.update({
        where: { id: existing.id },
        data: {
          credentialHash: issued.hash,
          credentialRotatedAt: issued.issuedAt,
        },
      });
      await transaction.auditLog.create({
        data: auditData({
          eventType: 'DEVICE_CREDENTIAL_ROTATED',
          device: updated,
          organizationId,
          principal,
          request,
          metadata: { rotatedAt: issued.issuedAt.toISOString() },
        }),
      });
      return updated;
    });

    return credentialResponse(device, issued);
  }

  async disable(
    organizationId: string,
    deviceId: string,
    principal: AuthenticatedPrincipal,
    request: AuditRequestContext,
  ): Promise<DeviceResponse> {
    const device = await this.prisma.$transaction(async (transaction) => {
      const existing = await lockDevice(transaction, organizationId, deviceId);
      if (existing === null) throw deviceNotFound();
      if (existing.lifecycleStatus === DeviceLifecycleStatus.DISABLED) return existing;

      const disabledAt = new Date();
      const updated = await transaction.device.update({
        where: { id: existing.id },
        data: { lifecycleStatus: DeviceLifecycleStatus.DISABLED, disabledAt },
      });
      await transaction.currentMonitoringPointState.updateMany({
        where: { monitoringPointId: existing.monitoringPointId, deviceId: existing.id },
        data: {
          serverRisk: 'UNKNOWN',
          connectivityStatus: 'UNKNOWN',
          reasons: ['DEVICE_DISABLED'],
          evaluatedAt: disabledAt,
          watchConsecutiveSamples: 0,
          dangerConsecutiveSamples: 0,
          mismatchConsecutiveSamples: 0,
          pendingDowngradeRisk: null,
          pendingDowngradeSince: null,
        },
      });
      await transaction.auditLog.create({
        data: auditData({
          eventType: 'DEVICE_DISABLED',
          device: updated,
          organizationId,
          principal,
          request,
          metadata: {
            before: { lifecycleStatus: existing.lifecycleStatus, disabledAt: null },
            after: {
              lifecycleStatus: updated.lifecycleStatus,
              disabledAt: disabledAt.toISOString(),
            },
          },
        }),
      });
      return updated;
    });

    return { data: toResponseData(device) };
  }
}

type DeviceSortDefinition =
  | {
      field: 'createdAt' | 'updatedAt' | 'displayName';
      direction: Prisma.SortOrder;
      nullable: false;
    }
  | {
      field: 'lastSeenAt';
      direction: typeof Prisma.SortOrder.desc;
      nullable: true;
    };

function sortDefinition(sort: DeviceSort): DeviceSortDefinition {
  const definitions = {
    [DeviceSort.CREATED_AT_DESC]: {
      field: 'createdAt',
      direction: Prisma.SortOrder.desc,
      nullable: false,
    },
    [DeviceSort.CREATED_AT_ASC]: {
      field: 'createdAt',
      direction: Prisma.SortOrder.asc,
      nullable: false,
    },
    [DeviceSort.UPDATED_AT_DESC]: {
      field: 'updatedAt',
      direction: Prisma.SortOrder.desc,
      nullable: false,
    },
    [DeviceSort.DISPLAY_NAME_ASC]: {
      field: 'displayName',
      direction: Prisma.SortOrder.asc,
      nullable: false,
    },
    [DeviceSort.DISPLAY_NAME_DESC]: {
      field: 'displayName',
      direction: Prisma.SortOrder.desc,
      nullable: false,
    },
    [DeviceSort.LAST_SEEN_AT_DESC]: {
      field: 'lastSeenAt',
      direction: Prisma.SortOrder.desc,
      nullable: true,
    },
  } as const;
  return definitions[sort];
}

function orderBy(sort: DeviceSortDefinition): Prisma.DeviceOrderByWithRelationInput[] {
  return sort.nullable
    ? [
        { lastSeenAt: { sort: Prisma.SortOrder.desc, nulls: Prisma.NullsOrder.last } },
        { id: 'desc' },
      ]
    : [{ [sort.field]: sort.direction }, { id: sort.direction }];
}

function cursorWhere(
  sort: DeviceSortDefinition,
  boundary: DeviceCursorBoundary,
): Prisma.DeviceWhereInput {
  const operator = sort.direction === Prisma.SortOrder.asc ? 'gt' : 'lt';
  if (sort.field === 'lastSeenAt') {
    if (boundary.value === null) return { lastSeenAt: null, id: { lt: boundary.id } };
    const value = new Date(boundary.value);
    return {
      OR: [
        { lastSeenAt: { lt: value } },
        { lastSeenAt: value, id: { lt: boundary.id } },
        { lastSeenAt: null },
      ],
    };
  }
  const value = sort.field === 'displayName' ? boundary.value : new Date(boundary.value ?? '');
  return {
    OR: [
      { [sort.field]: { [operator]: value } },
      { [sort.field]: value, id: { [operator]: boundary.id } },
    ],
  };
}

function cursorBoundary(
  sortField: DeviceSortDefinition['field'],
  device: Device,
): DeviceCursorBoundary {
  const value =
    sortField === 'displayName'
      ? device.displayName
      : sortField === 'lastSeenAt'
        ? (device.lastSeenAt?.toISOString() ?? null)
        : device[sortField].toISOString();
  return { id: device.id, value };
}

function toResponseData(device: Device): DeviceResponseData {
  return {
    id: device.id,
    organizationId: device.organizationId,
    siteId: device.siteId,
    monitoringPointId: device.monitoringPointId,
    hardwareId: device.hardwareId,
    displayName: device.displayName,
    lifecycleStatus: device.lifecycleStatus,
    firmwareVersion: device.firmwareVersion,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    lastTelemetryAt: device.lastTelemetryAt?.toISOString() ?? null,
    lastNetwork:
      device.lastNetworkType === null
        ? null
        : {
            type: device.lastNetworkType,
            signalRssi: device.lastSignalRssi?.toNumber() ?? null,
          },
    disabledAt: device.disabledAt?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  };
}

function credentialResponse(device: Device, issued: IssuedDeviceSecret): DeviceCredentialResponse {
  return {
    data: {
      device: toResponseData(device),
      credential: {
        scheme: 'Device',
        hardwareId: device.hardwareId,
        secret: issued.raw,
        issuedAt: issued.issuedAt.toISOString(),
        displayOnce: true,
      },
    },
  };
}

function mutableSnapshot(device: Device): Prisma.InputJsonObject {
  return {
    displayName: device.displayName,
    monitoringPointId: device.monitoringPointId,
    siteId: device.siteId,
    lifecycleStatus: device.lifecycleStatus,
  };
}

function auditData(input: {
  eventType:
    'DEVICE_REGISTERED' | 'DEVICE_UPDATED' | 'DEVICE_CREDENTIAL_ROTATED' | 'DEVICE_DISABLED';
  device: Device;
  organizationId: string;
  principal: AuthenticatedPrincipal;
  request: AuditRequestContext;
  metadata: Prisma.InputJsonObject;
}): Prisma.AuditLogUncheckedCreateInput {
  return {
    actorId: input.principal.userId,
    organizationId: input.organizationId,
    eventType: input.eventType,
    entityType: 'Device',
    entityId: input.device.id,
    requestId: input.request.requestId,
    ipAddress: input.request.ipAddress,
    userAgent: input.request.userAgent,
    metadata: input.metadata,
  };
}

async function lockMonitoringPoint(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  monitoringPointId: string,
): Promise<{ id: string; siteId: string; isActive: boolean } | null> {
  const rows = await transaction.$queryRaw<
    Array<{ id: string; siteId: string; isActive: boolean }>
  >(Prisma.sql`
    SELECT "id", "siteId", "isActive"
    FROM "MonitoringPoint"
    WHERE "id" = ${monitoringPointId}
      AND "organizationId" = ${organizationId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function lockDevice(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  deviceId: string,
): Promise<Device | null> {
  const rows = await transaction.$queryRaw<Array<Device>>(Prisma.sql`
    SELECT *
    FROM "Device"
    WHERE "id" = ${deviceId}
      AND "organizationId" = ${organizationId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function emptyPayload(): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Payload tidak valid.',
    details: [{ field: 'body', messages: ['Minimal satu property diperlukan.'] }],
  });
}

function deviceNotFound(): NotFoundException {
  return new NotFoundException({ code: 'DEVICE_NOT_FOUND', message: 'Device tidak ditemukan.' });
}

function monitoringPointNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'MONITORING_POINT_NOT_FOUND',
    message: 'Monitoring point tidak ditemukan.',
  });
}

function hardwareIdConflict(): ConflictException {
  return new ConflictException({
    code: 'HARDWARE_ID_CONFLICT',
    message: 'Hardware ID sudah digunakan.',
  });
}

function monitoringPointOccupied(): ConflictException {
  return new ConflictException({
    code: 'MONITORING_POINT_ACTIVE_DEVICE_CONFLICT',
    message: 'Monitoring point sudah memiliki device aktif.',
  });
}
