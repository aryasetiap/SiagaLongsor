import { describe, expect, it } from 'vitest';

import { parseAppConfig } from './app-config.js';

const requiredEnvironment = {
  DATABASE_URL: 'postgresql://user:password@localhost:55432/database',
  AUTH_ACCESS_TOKEN_SECRET: 'a-development-only-secret-with-32-characters',
};

describe('parseAppConfig', () => {
  it('uses secure operational defaults', () => {
    const config = parseAppConfig(requiredEnvironment);

    expect(config.port).toBe(3001);
    expect(config.publicDashboard.hardwareId).toBeNull();
    expect(config.auth.accessTokenTtlSeconds).toBe(900);
    expect(config.auth.refreshTokenTtlSeconds).toBe(2_592_000);
    expect(config.auth.loginRateLimitMax).toBe(5);
    expect(config.telemetry.maxFutureSkewSeconds).toBe(300);
    expect(config.telemetry.rateLimitTtlMs).toBe(60_000);
    expect(config.telemetry.rateLimitMax).toBe(120);
  });

  it('accepts an explicit public dashboard device selector', () => {
    const config = parseAppConfig({
      ...requiredEnvironment,
      PUBLIC_DEVICE_HARDWARE_ID: 'SIAGALONGSOR-001',
    });

    expect(config.publicDashboard.hardwareId).toBe('SIAGALONGSOR-001');
  });

  it('rejects an access-token secret shorter than 32 characters without echoing it', () => {
    const weakSecret = 'too-short';

    expect(() =>
      parseAppConfig({
        ...requiredEnvironment,
        AUTH_ACCESS_TOKEN_SECRET: weakSecret,
      }),
    ).toThrow('AUTH_ACCESS_TOKEN_SECRET');
    expect(() =>
      parseAppConfig({
        ...requiredEnvironment,
        AUTH_ACCESS_TOKEN_SECRET: weakSecret,
      }),
    ).not.toThrow(weakSecret);
  });
});
