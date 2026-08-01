import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

export interface AccessTokenClaims {
  readonly sub: string;
  readonly sid: string;
  readonly type: 'access';
  readonly jti: string;
}

export interface VerifiedAccessTokenClaims extends AccessTokenClaims {
  readonly exp: number;
}

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  sign(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.config.auth.accessTokenSecret,
      issuer: this.config.auth.issuer,
      audience: this.config.auth.audience,
      expiresIn: this.config.auth.accessTokenTtlSeconds,
    });
  }

  async verify(token: string): Promise<VerifiedAccessTokenClaims> {
    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.auth.accessTokenSecret,
        issuer: this.config.auth.issuer,
        audience: this.config.auth.audience,
      });

      if (
        claims.type !== 'access' ||
        typeof claims.sub !== 'string' ||
        typeof claims.sid !== 'string' ||
        typeof claims.jti !== 'string' ||
        typeof (claims as Partial<VerifiedAccessTokenClaims>).exp !== 'number'
      ) {
        throw new Error('Invalid claims');
      }

      return claims as VerifiedAccessTokenClaims;
    } catch {
      throw new UnauthorizedException({
        code: 'ACCESS_TOKEN_INVALID',
        message: 'Access token tidak valid atau sudah kedaluwarsa.',
      });
    }
  }
}
