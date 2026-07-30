export type Role = 'PROJECT_OWNER' | 'SCHOOL_ADMIN';

export interface PrincipalMembership {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: Role;
}

export interface Principal {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly memberships: readonly PrincipalMembership[];
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}
