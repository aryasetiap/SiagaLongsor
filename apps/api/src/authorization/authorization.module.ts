import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { OrganizationScopeGuard } from './organization-scope.guard.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: OrganizationScopeGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AuthorizationModule {}
