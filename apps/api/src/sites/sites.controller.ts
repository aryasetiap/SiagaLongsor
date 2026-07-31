import { Body, Controller, Get, Param, Put, Query, Req } from '@nestjs/common';

import { CurrentOrganization } from '../authorization/current-organization.decorator.js';
import { CurrentPrincipal } from '../authorization/current-principal.decorator.js';
import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';
import type { OrganizationContext } from '../authorization/authorization.types.js';
import { OrganizationHeaderScoped } from '../authorization/organization-scoped.decorator.js';
import { Roles } from '../authorization/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { getAuditRequestContext, type RequestWithContext } from '../common/http/request-context.js';
import { RiskProfileSiteIdDto, UpdateRiskProfileDto } from '../risk/dto/risk-profile.dto.js';
import { RiskProfileService } from '../risk/risk-profile.service.js';
import type {
  RiskProfileMutationResponse,
  RiskProfileResponse,
} from '../risk/risk-profile.types.js';
import { ListSitesQueryDto } from './dto/site.dto.js';
import { SitesService } from './sites.service.js';
import type { SiteListResponse } from './sites.types.js';

@Controller('sites')
@OrganizationHeaderScoped()
export class SitesController {
  constructor(
    private readonly sites: SitesService,
    private readonly riskProfiles: RiskProfileService,
  ) {}

  @Get()
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: ListSitesQueryDto,
  ): Promise<SiteListResponse> {
    return this.sites.list(organization.organizationId, query);
  }

  @Get(':siteId/risk-profile')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  getRiskProfile(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() parameters: RiskProfileSiteIdDto,
  ): Promise<RiskProfileResponse> {
    return this.riskProfiles.get(organization.organizationId, parameters.siteId);
  }

  @Put(':siteId/risk-profile')
  @Roles(Role.PROJECT_OWNER)
  replaceRiskProfile(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: RiskProfileSiteIdDto,
    @Body() input: UpdateRiskProfileDto,
    @Req() request: RequestWithContext,
  ): Promise<RiskProfileMutationResponse> {
    return this.riskProfiles.replace(
      organization.organizationId,
      parameters.siteId,
      input,
      principal,
      getAuditRequestContext(request),
    );
  }
}
