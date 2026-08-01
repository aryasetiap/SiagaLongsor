import { Controller, Get, Query } from '@nestjs/common';

import { CurrentOrganization } from '../authorization/current-organization.decorator.js';
import type { OrganizationContext } from '../authorization/authorization.types.js';
import { OrganizationHeaderScoped } from '../authorization/organization-scoped.decorator.js';
import { Roles } from '../authorization/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { AuditLogsService } from './audit-logs.service.js';
import type { AuditLogListResponse } from './audit-log.types.js';
import { AuditLogListQueryDto } from './dto/audit-log.dto.js';

@Controller('audit-logs')
@OrganizationHeaderScoped()
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  @Roles(Role.PROJECT_OWNER)
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: AuditLogListQueryDto,
  ): Promise<AuditLogListResponse> {
    return this.auditLogs.list(organization.organizationId, query);
  }
}
