import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from '@nestjs/common';

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
import { AlertIdDto, AlertListQueryDto } from '../risk/dto/risk-read.dto.js';
import type { AlertListResponse, AlertResponse } from '../risk/risk-read.types.js';
import { AlertEventsService } from './alert-events.service.js';
import { AlertLifecycleService } from './alert-lifecycle.service.js';
import type { AlertEventListResponse, AlertMutationResponse } from './alert-lifecycle.types.js';
import { AlertsService } from './alerts.service.js';
import {
  AcknowledgeAlertDto,
  AlertEventListQueryDto,
  FalseAlarmAlertDto,
  ResolveAlertDto,
} from './dto/alert-lifecycle.dto.js';

@Controller('alerts')
@OrganizationHeaderScoped()
export class AlertsController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly lifecycle: AlertLifecycleService,
    private readonly events: AlertEventsService,
  ) {}

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

  @Post(':alertId/acknowledge')
  @HttpCode(200)
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  acknowledge(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: AlertIdDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: AcknowledgeAlertDto,
    @Req() request: RequestWithContext,
  ): Promise<AlertMutationResponse> {
    return this.lifecycle.acknowledge(
      organization.organizationId,
      parameters.alertId,
      idempotencyKey,
      input,
      principal,
      getAuditRequestContext(request),
    );
  }

  @Post(':alertId/resolve')
  @HttpCode(200)
  @Roles(Role.PROJECT_OWNER)
  resolve(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: AlertIdDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ResolveAlertDto,
    @Req() request: RequestWithContext,
  ): Promise<AlertMutationResponse> {
    return this.lifecycle.resolve(
      organization.organizationId,
      parameters.alertId,
      idempotencyKey,
      input,
      principal,
      getAuditRequestContext(request),
    );
  }

  @Post(':alertId/false-alarm')
  @HttpCode(200)
  @Roles(Role.PROJECT_OWNER)
  falseAlarm(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: AlertIdDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: FalseAlarmAlertDto,
    @Req() request: RequestWithContext,
  ): Promise<AlertMutationResponse> {
    return this.lifecycle.falseAlarm(
      organization.organizationId,
      parameters.alertId,
      idempotencyKey,
      input,
      principal,
      getAuditRequestContext(request),
    );
  }

  @Get(':alertId/events')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  listEvents(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() parameters: AlertIdDto,
    @Query() query: AlertEventListQueryDto,
  ): Promise<AlertEventListResponse> {
    return this.events.list(organization.organizationId, parameters.alertId, query);
  }
}
