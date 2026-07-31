import { Controller, Get, Param, Query } from '@nestjs/common';

import { CurrentOrganization } from '../authorization/current-organization.decorator.js';
import type { OrganizationContext } from '../authorization/authorization.types.js';
import { OrganizationHeaderScoped } from '../authorization/organization-scoped.decorator.js';
import { Roles } from '../authorization/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { MonitoringPointIdDto } from '../monitoring-points/dto/monitoring-point.dto.js';
import { MonitoringOverviewQueryDto, RiskAssessmentHistoryQueryDto } from './dto/risk-read.dto.js';
import { RiskReadService } from './risk-read.service.js';
import type { MonitoringOverviewResponse, RiskAssessmentListResponse } from './risk-read.types.js';

@Controller()
@OrganizationHeaderScoped()
export class RiskReadController {
  constructor(private readonly reads: RiskReadService) {}

  @Get('monitoring-overview')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  overview(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: MonitoringOverviewQueryDto,
  ): Promise<MonitoringOverviewResponse> {
    return this.reads.overview(organization.organizationId, query);
  }

  @Get('monitoring-points/:monitoringPointId/risk-assessments')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  history(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() parameters: MonitoringPointIdDto,
    @Query() query: RiskAssessmentHistoryQueryDto,
  ): Promise<RiskAssessmentListResponse> {
    return this.reads.assessmentHistory(
      organization.organizationId,
      parameters.monitoringPointId,
      query,
    );
  }
}
