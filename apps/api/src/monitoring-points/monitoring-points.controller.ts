import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { CurrentOrganization } from '../authorization/current-organization.decorator.js';
import { CurrentPrincipal } from '../authorization/current-principal.decorator.js';
import type {
  AuthenticatedPrincipal,
  OrganizationContext,
} from '../authorization/authorization.types.js';
import { OrganizationHeaderScoped } from '../authorization/organization-scoped.decorator.js';
import { Roles } from '../authorization/roles.decorator.js';
import { getAuditRequestContext, type RequestWithContext } from '../common/http/request-context.js';
import { Role } from '../generated/prisma/enums.js';
import {
  CreateMonitoringPointDto,
  ListMonitoringPointsQueryDto,
  MonitoringPointIdDto,
  UpdateMonitoringPointDto,
} from './dto/monitoring-point.dto.js';
import { MonitoringPointsService } from './monitoring-points.service.js';
import type {
  MonitoringPointListResponse,
  MonitoringPointResponse,
} from './monitoring-points.types.js';

@Controller('monitoring-points')
@OrganizationHeaderScoped()
export class MonitoringPointsController {
  constructor(private readonly monitoringPoints: MonitoringPointsService) {}

  @Get()
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: ListMonitoringPointsQueryDto,
  ): Promise<MonitoringPointListResponse> {
    return this.monitoringPoints.list(organization.organizationId, query);
  }

  @Post()
  @HttpCode(201)
  @Roles(Role.PROJECT_OWNER)
  create(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: CreateMonitoringPointDto,
    @Req() request: RequestWithContext,
  ): Promise<MonitoringPointResponse> {
    return this.monitoringPoints.create(
      organization.organizationId,
      input,
      principal,
      getAuditRequestContext(request),
    );
  }

  @Get(':monitoringPointId')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  get(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() parameters: MonitoringPointIdDto,
  ): Promise<MonitoringPointResponse> {
    return this.monitoringPoints.get(organization.organizationId, parameters.monitoringPointId);
  }

  @Patch(':monitoringPointId')
  @Roles(Role.PROJECT_OWNER)
  update(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: MonitoringPointIdDto,
    @Body() input: UpdateMonitoringPointDto,
    @Req() request: RequestWithContext,
  ): Promise<MonitoringPointResponse> {
    return this.monitoringPoints.update(
      organization.organizationId,
      parameters.monitoringPointId,
      input,
      principal,
      getAuditRequestContext(request),
    );
  }
}
