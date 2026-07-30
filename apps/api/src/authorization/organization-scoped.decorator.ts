import { SetMetadata } from '@nestjs/common';

export interface OrganizationScopeMetadata {
  readonly parameter: string;
}

export const ORGANIZATION_SCOPE = 'authorization:organization-scope';
export const OrganizationScoped = (
  parameter = 'organizationId',
): MethodDecorator & ClassDecorator =>
  SetMetadata(ORGANIZATION_SCOPE, { parameter } satisfies OrganizationScopeMetadata);
