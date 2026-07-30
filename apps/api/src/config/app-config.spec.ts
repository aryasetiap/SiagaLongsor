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
    expect(config.auth.accessTokenTtlSeconds).toBe(900);
    expect(config.auth.refreshTokenTtlSeconds).toBe(2_592_000);
    expect(config.auth.loginRateLimitMax).toBe(5);
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
