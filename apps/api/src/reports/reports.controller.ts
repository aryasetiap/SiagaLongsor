import { once } from 'node:events';

import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';

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
  CreateReportJobDto,
  ReportJobIdDto,
  ReportJobListQueryDto,
  TelemetryCsvQueryDto,
} from './dto/reports.dto.js';
import { ReportJobsService } from './report-jobs.service.js';
import type { ReportJobListResponse, ReportJobResponse } from './reports.types.js';
import { csvHeader, serializeTelemetryCsvRow, telemetryCsvFilename } from './telemetry-csv.js';
import { TelemetryCsvService } from './telemetry-csv.service.js';

@Controller()
@OrganizationHeaderScoped()
export class ReportsController {
  constructor(
    private readonly telemetryCsv: TelemetryCsvService,
    private readonly reportJobs: ReportJobsService,
  ) {}

  @Get('reports/telemetry.csv')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  async exportTelemetry(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: TelemetryCsvQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const prepared = await this.telemetryCsv.prepare(organization.organizationId, query);
    response.status(200);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${telemetryCsvFilename(prepared.siteId, prepared.range.from, prepared.range.to)}"`,
    );
    try {
      if (!(await write(response, csvHeader()))) return;
      for await (const record of prepared.records) {
        if (!(await write(response, serializeTelemetryCsvRow(record)))) return;
      }
      if (!response.destroyed && !response.writableEnded) response.end();
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      throw error;
    }
  }

  @Post('report-jobs')
  @HttpCode(202)
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  createReportJob(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: CreateReportJobDto,
    @Req() request: RequestWithContext,
  ): Promise<ReportJobResponse> {
    return this.reportJobs.create(organization, principal, input, getAuditRequestContext(request));
  }

  @Get('report-jobs')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  reportJobList(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: ReportJobListQueryDto,
  ): Promise<ReportJobListResponse> {
    return this.reportJobs.list(organization.organizationId, query);
  }

  @Get('report-jobs/:reportJobId')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  reportJob(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() parameters: ReportJobIdDto,
  ): Promise<ReportJobResponse> {
    return this.reportJobs.get(organization.organizationId, parameters.reportJobId);
  }

  @Get('report-jobs/:reportJobId/content')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  @Header('X-Content-Type-Options', 'nosniff')
  async reportContent(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() parameters: ReportJobIdDto,
  ): Promise<StreamableFile> {
    const content = await this.reportJobs.content(
      organization.organizationId,
      parameters.reportJobId,
    );
    return new StreamableFile(content.body, {
      type: 'application/pdf',
      disposition: `attachment; filename="${content.fileName}"`,
      length: content.body.length,
    });
  }
}

async function write(response: Response, chunk: string): Promise<boolean> {
  if (response.destroyed || response.writableEnded) return false;
  if (response.write(chunk)) return true;
  await Promise.race([once(response, 'drain'), once(response, 'close')]);
  return !response.destroyed && !response.writableEnded;
}
