import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';
import type { AuditRequestContext } from '../common/http/request-context.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { DeviceLifecycleStatus } from '../generated/prisma/enums.js';
import {
  type CreateMonitoringPointDto,
  type ListMonitoringPointsQueryDto,
  MonitoringPointSort,
  type UpdateMonitoringPointDto,
} from './dto/monitoring-point.dto.js';
import { MonitoringPointCursorService } from './monitoring-point-cursor.service.js';
import type {
  MonitoringPointListResponse,
  MonitoringPointResponse,
  MonitoringPointResponseData,
} from './monitoring-points.types.js';

const monitoringPointInclude = {
  devices: {
    where: { lifecycleStatus: DeviceLifecycleStatus.ENABLED },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      id: true,
      hardwareId: true,
      displayName: true,
      lifecycleStatus: true,
      lastSeenAt: true,
    },
  },
} satisfies Prisma.MonitoringPointInclude;

type MonitoringPointWithDevice = Prisma.MonitoringPointGetPayload<{
  include: typeof monitoringPointInclude;
}>;

@Injectable()
export class MonitoringPointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursors: MonitoringPointCursorService,
  ) {}

  async list(
    organizationId: string,
    query: ListMonitoringPointsQueryDto,
  ): Promise<MonitoringPointListResponse> {
    const cursor =
      query.cursor === undefined ? null : this.cursors.decode(query.cursor, organizationId, query);
    const sort = sortDefinition(query.sort);
    const baseWhere: Prisma.MonitoringPointWhereInput = {
      organizationId,
      ...(query.siteId === undefined ? {} : { siteId: query.siteId }),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search === undefined
        ? {}
        : {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { locationDescription: { contains: query.search, mode: 'insensitive' } },
            ],
          }),
    };
    const where: Prisma.MonitoringPointWhereInput =
      cursor === null
        ? baseWhere
        : { AND: [baseWhere, cursorWhere(sort.field, sort.direction, cursor)] };
    const rows = await this.prisma.monitoringPoint.findMany({
      where,
      include: monitoringPointInclude,
      orderBy: [{ [sort.field]: sort.direction }, { id: sort.direction }],
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
            ? this.cursors.encode(organizationId, query, {
                id: last.id,
                value: sort.field === 'name' ? last.name : last[sort.field].toISOString(),
              })
            : null,
      },
    };
  }

  async create(
    organizationId: string,
    input: CreateMonitoringPointDto,
    principal: AuthenticatedPrincipal,
    request: AuditRequestContext,
  ): Promise<MonitoringPointResponse> {
    const point = await this.prisma.$transaction(async (transaction) => {
      const site = await transaction.site.findFirst({
        where: { id: input.siteId, organizationId },
        select: { id: true },
      });
      if (site === null) throw siteNotFound();

      const created = await transaction.monitoringPoint.create({
        data: {
          organizationId,
          siteId: input.siteId,
          name: input.name,
          description: input.description ?? null,
          locationDescription: input.locationDescription ?? null,
          isActive: true,
        },
        include: monitoringPointInclude,
      });
      await transaction.auditLog.create({
        data: auditData({
          eventType: 'MONITORING_POINT_CREATED',
          pointId: created.id,
          organizationId,
          principal,
          request,
          metadata: { after: mutableSnapshot(created) },
        }),
      });
      return created;
    });

    return { data: toResponseData(point) };
  }

  async get(organizationId: string, monitoringPointId: string): Promise<MonitoringPointResponse> {
    const point = await this.prisma.monitoringPoint.findFirst({
      where: { id: monitoringPointId, organizationId },
      include: monitoringPointInclude,
    });
    if (point === null) throw monitoringPointNotFound();
    return { data: toResponseData(point) };
  }

  async update(
    organizationId: string,
    monitoringPointId: string,
    input: UpdateMonitoringPointDto,
    principal: AuthenticatedPrincipal,
    request: AuditRequestContext,
  ): Promise<MonitoringPointResponse> {
    if (
      input.name === undefined &&
      input.description === undefined &&
      input.locationDescription === undefined &&
      input.isActive === undefined
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Payload tidak valid.',
        details: [{ field: 'body', messages: ['Minimal satu property diperlukan.'] }],
      });
    }

    const point = await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "MonitoringPoint"
        WHERE "id" = ${monitoringPointId}
          AND "organizationId" = ${organizationId}
        FOR UPDATE
      `);
      if (locked.length === 0) throw monitoringPointNotFound();

      const existing = await transaction.monitoringPoint.findFirstOrThrow({
        where: { id: monitoringPointId, organizationId },
        include: monitoringPointInclude,
      });
      const changes = updateChanges(existing, input);
      if (Object.keys(changes).length === 0) return existing;

      if (changes.isActive === false && existing.isActive && existing.devices.length > 0) {
        throw new ConflictException({
          code: 'MONITORING_POINT_ACTIVE_DEVICE_CONFLICT',
          message: 'Monitoring point dengan device aktif tidak dapat dinonaktifkan.',
        });
      }

      const updated = await transaction.monitoringPoint.update({
        where: { id: existing.id },
        data: changes,
        include: monitoringPointInclude,
      });
      await transaction.auditLog.create({
        data: auditData({
          eventType: 'MONITORING_POINT_UPDATED',
          pointId: updated.id,
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

    return { data: toResponseData(point) };
  }
}

function sortDefinition(sort: MonitoringPointSort): {
  field: 'createdAt' | 'updatedAt' | 'name';
  direction: Prisma.SortOrder;
} {
  const definitions = {
    [MonitoringPointSort.CREATED_AT_DESC]: { field: 'createdAt', direction: Prisma.SortOrder.desc },
    [MonitoringPointSort.CREATED_AT_ASC]: { field: 'createdAt', direction: Prisma.SortOrder.asc },
    [MonitoringPointSort.UPDATED_AT_DESC]: { field: 'updatedAt', direction: Prisma.SortOrder.desc },
    [MonitoringPointSort.NAME_ASC]: { field: 'name', direction: Prisma.SortOrder.asc },
    [MonitoringPointSort.NAME_DESC]: { field: 'name', direction: Prisma.SortOrder.desc },
  } as const;
  return definitions[sort];
}

function cursorWhere(
  field: 'createdAt' | 'updatedAt' | 'name',
  direction: Prisma.SortOrder,
  boundary: { id: string; value: string },
): Prisma.MonitoringPointWhereInput {
  const operator = direction === Prisma.SortOrder.asc ? 'gt' : 'lt';
  const value = field === 'name' ? boundary.value : new Date(boundary.value);
  return {
    OR: [{ [field]: { [operator]: value } }, { [field]: value, id: { [operator]: boundary.id } }],
  };
}

function updateChanges(
  existing: MonitoringPointWithDevice,
  input: UpdateMonitoringPointDto,
): Prisma.MonitoringPointUpdateInput {
  const changes: Prisma.MonitoringPointUpdateInput = {};
  if (input.name !== undefined && input.name !== existing.name) changes.name = input.name;
  if (input.description !== undefined && input.description !== existing.description) {
    changes.description = input.description;
  }
  if (
    input.locationDescription !== undefined &&
    input.locationDescription !== existing.locationDescription
  ) {
    changes.locationDescription = input.locationDescription;
  }
  if (input.isActive !== undefined && input.isActive !== existing.isActive) {
    changes.isActive = input.isActive;
  }
  return changes;
}

function toResponseData(point: MonitoringPointWithDevice): MonitoringPointResponseData {
  const device = point.devices[0];
  return {
    id: point.id,
    organizationId: point.organizationId,
    siteId: point.siteId,
    name: point.name,
    description: point.description,
    locationDescription: point.locationDescription,
    isActive: point.isActive,
    currentDevice:
      device === undefined
        ? null
        : {
            id: device.id,
            hardwareId: device.hardwareId,
            displayName: device.displayName,
            lifecycleStatus: device.lifecycleStatus,
            lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
          },
    createdAt: point.createdAt.toISOString(),
    updatedAt: point.updatedAt.toISOString(),
  };
}

function mutableSnapshot(point: MonitoringPointWithDevice): Prisma.InputJsonObject {
  return {
    name: point.name,
    description: point.description,
    locationDescription: point.locationDescription,
    isActive: point.isActive,
  };
}

function auditData(input: {
  eventType: 'MONITORING_POINT_CREATED' | 'MONITORING_POINT_UPDATED';
  pointId: string;
  organizationId: string;
  principal: AuthenticatedPrincipal;
  request: AuditRequestContext;
  metadata: Prisma.InputJsonObject;
}): Prisma.AuditLogUncheckedCreateInput {
  return {
    actorId: input.principal.userId,
    organizationId: input.organizationId,
    eventType: input.eventType,
    entityType: 'MonitoringPoint',
    entityId: input.pointId,
    requestId: input.request.requestId,
    ipAddress: input.request.ipAddress,
    userAgent: input.request.userAgent,
    metadata: input.metadata,
  };
}

function siteNotFound(): NotFoundException {
  return new NotFoundException({ code: 'SITE_NOT_FOUND', message: 'Site tidak ditemukan.' });
}

function monitoringPointNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'MONITORING_POINT_NOT_FOUND',
    message: 'Monitoring point tidak ditemukan.',
  });
}
