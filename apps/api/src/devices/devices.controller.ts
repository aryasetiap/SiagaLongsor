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
  DeviceIdDto,
  ListDevicesQueryDto,
  RegisterDeviceDto,
  UpdateDeviceDto,
} from './dto/device.dto.js';
import { DevicesService } from './devices.service.js';
import type {
  DeviceCredentialResponse,
  DeviceListResponse,
  DeviceResponse,
} from './devices.types.js';

@Controller('devices')
@OrganizationHeaderScoped()
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: ListDevicesQueryDto,
  ): Promise<DeviceListResponse> {
    return this.devices.list(organization.organizationId, query);
  }

  @Post()
  @HttpCode(201)
  @Roles(Role.PROJECT_OWNER)
  register(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: RegisterDeviceDto,
    @Req() request: RequestWithContext,
  ): Promise<DeviceCredentialResponse> {
    return this.devices.register(
      organization.organizationId,
      input,
      principal,
      getAuditRequestContext(request),
    );
  }

  @Get(':deviceId')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  get(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() parameters: DeviceIdDto,
  ): Promise<DeviceResponse> {
    return this.devices.get(organization.organizationId, parameters.deviceId);
  }

  @Patch(':deviceId')
  @Roles(Role.PROJECT_OWNER)
  update(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: DeviceIdDto,
    @Body() input: UpdateDeviceDto,
    @Req() request: RequestWithContext,
  ): Promise<DeviceResponse> {
    return this.devices.update(
      organization.organizationId,
      parameters.deviceId,
      input,
      principal,
      getAuditRequestContext(request),
    );
  }

  @Post(':deviceId/rotate-credential')
  @HttpCode(200)
  @Roles(Role.PROJECT_OWNER)
  rotateCredential(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: DeviceIdDto,
    @Req() request: RequestWithContext,
  ): Promise<DeviceCredentialResponse> {
    return this.devices.rotateCredential(
      organization.organizationId,
      parameters.deviceId,
      principal,
      getAuditRequestContext(request),
    );
  }

  @Post(':deviceId/disable')
  @HttpCode(200)
  @Roles(Role.PROJECT_OWNER)
  disable(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: DeviceIdDto,
    @Req() request: RequestWithContext,
  ): Promise<DeviceResponse> {
    return this.devices.disable(
      organization.organizationId,
      parameters.deviceId,
      principal,
      getAuditRequestContext(request),
    );
  }
}
