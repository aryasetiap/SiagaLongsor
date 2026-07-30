import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';

export interface AuthTokenResult {
  readonly accessToken: string;
  readonly accessTokenExpiresIn: number;
  readonly refreshToken: string;
  readonly principal: AuthenticatedPrincipal;
}

export interface AuthResponse {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly memberships: AuthenticatedPrincipal['memberships'];
  };
}

export function toAuthResponse(result: AuthTokenResult): AuthResponse {
  return {
    accessToken: result.accessToken,
    tokenType: 'Bearer',
    expiresIn: result.accessTokenExpiresIn,
    user: {
      id: result.principal.userId,
      email: result.principal.email,
      name: result.principal.name,
      memberships: result.principal.memberships,
    },
  };
}
