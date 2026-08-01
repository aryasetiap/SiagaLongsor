import { Controller, Get, Param, Query } from '@nestjs/common';

import { CurrentOrganization } from '../authorization/current-organization.decorator.js';
import type { OrganizationContext } from '../authorization/authorization.types.js';
import { OrganizationHeaderScoped } from '../authorization/organization-scoped.decorator.js';
import { Roles } from '../authorization/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { MonitoringPointIdDto } from '../monitoring-points/dto/monitoring-point.dto.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardSummaryQueryDto, SensorSeriesQueryDto } from './dto/dashboard.dto.js';
import type { DashboardSummaryResponse, SensorSeriesResponse } from './dashboard.types.js';

@Controller()
@OrganizationHeaderScoped()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard/summary')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  summary(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: DashboardSummaryQueryDto,
  ): Promise<DashboardSummaryResponse> {
    return this.dashboard.summary(organization.organizationId, query);
  }

  @Get('monitoring-points/:monitoringPointId/sensor-series')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  sensorSeries(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() parameters: MonitoringPointIdDto,
    @Query() query: SensorSeriesQueryDto,
  ): Promise<SensorSeriesResponse> {
    return this.dashboard.sensorSeries(
      organization.organizationId,
      parameters.monitoringPointId,
      query,
    );
  }
}
