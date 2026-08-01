import {
  BadRequestException,
  Controller,
  Get,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { CurrentOrganization } from '../authorization/current-organization.decorator.js';
import { CurrentPrincipal } from '../authorization/current-principal.decorator.js';
import type {
  AuthenticatedPrincipal,
  OrganizationContext,
} from '../authorization/authorization.types.js';
import { OrganizationHeaderScoped } from '../authorization/organization-scoped.decorator.js';
import { Roles } from '../authorization/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { RealtimeAuthorizationService } from './realtime-authorization.service.js';
import { RealtimeConnectionRegistry } from './realtime-connection.registry.js';
import { serializeKeepalive } from './realtime-message.js';

const forbiddenQueryParameters = new Set(['token', 'access_token', 'credential']);

@Controller('realtime')
@OrganizationHeaderScoped()
export class RealtimeController {
  constructor(
    private readonly authorization: RealtimeAuthorizationService,
    private readonly registry: RealtimeConnectionRegistry,
  ) {}

  @Get('stream')
  @Roles(Role.PROJECT_OWNER, Role.SCHOOL_ADMIN)
  async stream(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (Object.keys(request.query).some((key) => forbiddenQueryParameters.has(key.toLowerCase()))) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Credential tidak boleh dikirim melalui query parameter.',
      });
    }
    const authorization = request.get('authorization');
    if (authorization === undefined || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'ACCESS_TOKEN_REQUIRED',
        message: 'Access token diperlukan.',
      });
    }
    const expiresAt = await this.authorization.verifiedExpiryMilliseconds(authorization);
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    if (!response.write(serializeKeepalive())) {
      response.end();
      return;
    }
    this.registry.register({
      organizationId: organization.organizationId,
      principal,
      expiresAt,
      transport: response,
    });
  }
}
