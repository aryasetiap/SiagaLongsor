import { Controller, Get, Param, Query } from '@nestjs/common';

import { CurrentOrganization } from '../authorization/current-organization.decorator.js';
import type { OrganizationContext } from '../authorization/authorization.types.js';
import { OrganizationHeaderScoped } from '../authorization/organization-scoped.decorator.js';
import { Roles } from '../authorization/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { AlertIdDto, AlertListQueryDto } from '../risk/dto/risk-read.dto.js';
import type { AlertListResponse, AlertResponse } from '../risk/risk-read.types.js';
import { AlertsService } from './alerts.service.js';

@Controller('alerts')
@OrganizationHeaderScoped()
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: AlertListQueryDto,
  ): Promise<AlertListResponse> {
    return this.alerts.list(organization.organizationId, query);
  }

  @Get(':alertId')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  get(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() parameters: AlertIdDto,
  ): Promise<AlertResponse> {
    return this.alerts.get(organization.organizationId, parameters.alertId);
  }
}
