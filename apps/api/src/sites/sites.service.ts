import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { type ListSitesQueryDto, SiteSort } from './dto/site.dto.js';
import { type SiteCursorBoundary, SiteCursorService } from './site-cursor.service.js';
import type { SiteListResponse, SiteResponseData } from './sites.types.js';

const siteSelect = {
  id: true,
  name: true,
  address: true,
  timezone: true,
  createdAt: true,
} satisfies Prisma.SiteSelect;

type SelectedSite = Prisma.SiteGetPayload<{ select: typeof siteSelect }>;

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursors: SiteCursorService,
  ) {}

  async list(organizationId: string, query: ListSitesQueryDto): Promise<SiteListResponse> {
    const cursor =
      query.cursor === undefined ? null : this.cursors.decode(query.cursor, organizationId, query);
    const sort = sortDefinition(query.sort);
    const baseWhere: Prisma.SiteWhereInput = {
      organizationId,
      ...(query.search === undefined
        ? {}
        : {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { address: { contains: query.search, mode: 'insensitive' } },
            ],
          }),
    };
    const where: Prisma.SiteWhereInput =
      cursor === null
        ? baseWhere
        : { AND: [baseWhere, cursorWhere(sort.field, sort.direction, cursor)] };
    const rows = await this.prisma.site.findMany({
      where,
      select: siteSelect,
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
                value: sort.field === 'name' ? last.name : last.createdAt.toISOString(),
              })
            : null,
      },
    };
  }
}

function sortDefinition(sort: SiteSort): {
  field: 'name' | 'createdAt';
  direction: Prisma.SortOrder;
} {
  const definitions = {
    [SiteSort.NAME_ASC]: { field: 'name', direction: Prisma.SortOrder.asc },
    [SiteSort.NAME_DESC]: { field: 'name', direction: Prisma.SortOrder.desc },
    [SiteSort.CREATED_AT_DESC]: { field: 'createdAt', direction: Prisma.SortOrder.desc },
  } as const;
  return definitions[sort];
}

function cursorWhere(
  field: 'name' | 'createdAt',
  direction: Prisma.SortOrder,
  boundary: SiteCursorBoundary,
): Prisma.SiteWhereInput {
  const operator = direction === Prisma.SortOrder.asc ? 'gt' : 'lt';
  const value = field === 'name' ? boundary.value : new Date(boundary.value);
  return {
    OR: [{ [field]: { [operator]: value } }, { [field]: value, id: { [operator]: boundary.id } }],
  };
}

function toResponseData(site: SelectedSite): SiteResponseData {
  return {
    id: site.id,
    name: site.name,
    address: site.address,
    timezone: site.timezone,
  };
}
