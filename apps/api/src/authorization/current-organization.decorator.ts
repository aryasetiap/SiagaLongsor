import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { RequestWithContext } from '../common/http/request-context.js';

export const CurrentOrganization = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<RequestWithContext>().organizationContext,
);
