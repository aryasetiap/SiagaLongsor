import { Body, Controller, Get, Put, Query, Req } from '@nestjs/common';

import { CurrentPrincipal } from '../authorization/current-principal.decorator.js';
import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';
import { Roles } from '../authorization/roles.decorator.js';
import type { RequestWithContext } from '../common/http/request-context.js';
import { Role } from '../generated/prisma/enums.js';
import { AuditQueryDto, OverviewQueryDto, SingleRiskProfileDto } from './single-device.dto.js';
import { SingleDeviceService } from './single-device.service.js';

@Controller()
@Roles(Role.PROJECT_OWNER)
export class SingleDeviceController {
  constructor(private readonly service: SingleDeviceService) {}
  @Get('overview') overview(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Query() q: OverviewQueryDto,
  ) {
    return this.service.overview(p, q);
  }
  @Get('device') device(@CurrentPrincipal() p: AuthenticatedPrincipal) {
    return this.service.device(p);
  }
  @Get('risk-profile') profile(@CurrentPrincipal() p: AuthenticatedPrincipal) {
    return this.service.profile(p);
  }
  @Put('risk-profile') updateProfile(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Body() input: SingleRiskProfileDto,
    @Req() req: RequestWithContext,
  ) {
    return this.service.updateProfile(p, input, req);
  }
  @Get('audit-log') audit(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Query() q: AuditQueryDto,
  ) {
    return this.service.audit(p, q);
  }
}
