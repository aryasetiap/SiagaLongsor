import { SetMetadata } from '@nestjs/common';

import type { Role } from '../generated/prisma/enums.js';

export const REQUIRED_ROLES = 'authorization:required-roles';
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES, roles);
