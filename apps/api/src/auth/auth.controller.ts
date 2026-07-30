import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';

import { CurrentPrincipal } from '../authorization/current-principal.decorator.js';
import { Public } from '../authorization/public.decorator.js';
import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';
import { getAuditRequestContext, type RequestWithContext } from '../common/http/request-context.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { AuthService } from './auth.service.js';
import { toAuthResponse, type AuthResponse } from './auth.types.js';
import { CookieOriginGuard } from './cookie-origin.guard.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() input: LoginDto,
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.login(input, getAuditRequestContext(request));
    this.setRefreshCookie(response, result.refreshToken);
    return toAuthResponse(result);
  }

  @Public()
  @UseGuards(CookieOriginGuard)
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const refreshToken = this.getRefreshCookie(request);

    if (refreshToken === undefined) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REQUIRED',
        message: 'Refresh token diperlukan.',
      });
    }

    const result = await this.authService.refresh(refreshToken, getAuditRequestContext(request));
    this.setRefreshCookie(response, result.refreshToken);
    return toAuthResponse(result);
  }

  @Public()
  @UseGuards(CookieOriginGuard)
  @HttpCode(204)
  @Post('logout')
  async logout(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.getRefreshCookie(request), getAuditRequestContext(request));
    response.clearCookie(this.config.auth.refreshCookieName, this.cookieOptions());
  }

  @Get('me')
  me(@CurrentPrincipal() principal: AuthenticatedPrincipal): AuthResponse['user'] {
    return {
      id: principal.userId,
      email: principal.email,
      name: principal.name,
      memberships: principal.memberships,
    };
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(this.config.auth.refreshCookieName, refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.config.auth.refreshTokenTtlSeconds * 1_000,
    });
  }

  private cookieOptions(): {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: string;
  } {
    return {
      httpOnly: true,
      secure: this.config.nodeEnv === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
    };
  }

  private getRefreshCookie(request: RequestWithContext): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[this.config.auth.refreshCookieName];
    return typeof value === 'string' ? value : undefined;
  }
}
