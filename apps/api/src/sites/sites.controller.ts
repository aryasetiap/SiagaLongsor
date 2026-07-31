import { Controller, Get, Query } from '@nestjs/common';

import { CurrentOrganization } from '../authorization/current-organization.decorator.js';
import type { OrganizationContext } from '../authorization/authorization.types.js';
import { OrganizationHeaderScoped } from '../authorization/organization-scoped.decorator.js';
import { Roles } from '../authorization/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { ListSitesQueryDto } from './dto/site.dto.js';
import { SitesService } from './sites.service.js';
import type { SiteListResponse } from './sites.types.js';

@Controller('sites')
@OrganizationHeaderScoped()
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: ListSitesQueryDto,
  ): Promise<SiteListResponse> {
    return this.sites.list(organization.organizationId, query);
  }
}
