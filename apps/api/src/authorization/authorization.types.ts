import type { Role } from '../generated/prisma/enums.js';

export interface PrincipalMembership {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: Role;
}

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string;
  readonly name: string;
  readonly memberships: readonly PrincipalMembership[];
}

export interface OrganizationContext {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: Role;
}
