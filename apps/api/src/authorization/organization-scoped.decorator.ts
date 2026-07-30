import { SetMetadata } from '@nestjs/common';

export interface OrganizationScopeMetadata {
  readonly source: 'header' | 'parameter';
  readonly key: string;
}

export const ORGANIZATION_SCOPE = 'authorization:organization-scope';
export const OrganizationScoped = (
  parameter = 'organizationId',
): MethodDecorator & ClassDecorator =>
  SetMetadata(ORGANIZATION_SCOPE, {
    source: 'parameter',
    key: parameter,
  } satisfies OrganizationScopeMetadata);

export const OrganizationHeaderScoped = (
  header = 'x-organization-id',
): MethodDecorator & ClassDecorator =>
  SetMetadata(ORGANIZATION_SCOPE, {
    source: 'header',
    key: header.toLowerCase(),
  } satisfies OrganizationScopeMetadata);
