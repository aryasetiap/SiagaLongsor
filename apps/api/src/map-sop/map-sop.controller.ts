import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

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
  ListSopVersionsQueryDto,
  MapOverviewQueryDto,
  SiteIdDto,
  SopDocumentIdDto,
  type UploadedPdfFile,
  UpdateMapConfigurationDto,
  UploadSopDto,
} from './dto/map-sop.dto.js';
import { MapConfigurationService } from './map-configuration.service.js';
import type {
  MapConfigurationMutationResponse,
  MapConfigurationResponse,
  MapOverviewResponse,
  SopDocumentListResponse,
  SopDocumentResponse,
} from './map-sop.types.js';
import { MAX_SOP_BYTES } from './sop-file.validation.js';
import { SopService } from './sop.service.js';

@Controller()
@OrganizationHeaderScoped()
export class MapSopController {
  constructor(
    private readonly maps: MapConfigurationService,
    private readonly sops: SopService,
  ) {}

  @Get('sites/:siteId/map-config')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  mapConfiguration(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() parameters: SiteIdDto,
  ): Promise<MapConfigurationResponse> {
    return this.maps.get(organization.organizationId, parameters.siteId);
  }

  @Put('sites/:siteId/map-config')
  @Roles(Role.PROJECT_OWNER)
  replaceMapConfiguration(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: SiteIdDto,
    @Body() input: UpdateMapConfigurationDto,
    @Req() request: RequestWithContext,
  ): Promise<MapConfigurationMutationResponse> {
    return this.maps.replace(
      organization.organizationId,
      parameters.siteId,
      input,
      principal,
      getAuditRequestContext(request),
    );
  }

  @Get('map/overview')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  overview(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: MapOverviewQueryDto,
  ): Promise<MapOverviewResponse> {
    return this.maps.overview(organization.organizationId, query.siteId);
  }

  @Get('sites/:siteId/sop')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  activeSop(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() parameters: SiteIdDto,
  ): Promise<SopDocumentResponse> {
    return this.sops.active(organization.organizationId, parameters.siteId);
  }

  @Post('sites/:siteId/sop')
  @HttpCode(201)
  @Roles(Role.PROJECT_OWNER)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SOP_BYTES } }))
  uploadSop(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: SiteIdDto,
    @Body() input: UploadSopDto,
    @UploadedFile() file: UploadedPdfFile | undefined,
    @Req() request: RequestWithContext,
  ): Promise<SopDocumentResponse> {
    return this.sops.upload(
      organization.organizationId,
      parameters.siteId,
      input,
      file,
      principal,
      getAuditRequestContext(request),
    );
  }

  @Get('sites/:siteId/sop/versions')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  sopVersions(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() parameters: SiteIdDto,
    @Query() query: ListSopVersionsQueryDto,
  ): Promise<SopDocumentListResponse> {
    return this.sops.versions(organization.organizationId, parameters.siteId, query);
  }

  @Get('sop-documents/:documentId/content')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  @Header('X-Content-Type-Options', 'nosniff')
  async sopContent(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() parameters: SopDocumentIdDto,
  ): Promise<StreamableFile> {
    const content = await this.sops.content(organization.organizationId, parameters.documentId);
    return new StreamableFile(content.body, {
      type: content.mediaType,
      disposition: content.contentDisposition,
      length: content.body.length,
    });
  }
}
