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
    expect(config.telemetry.maxFutureSkewSeconds).toBe(300);
    expect(config.telemetry.rateLimitTtlMs).toBe(60_000);
    expect(config.telemetry.rateLimitMax).toBe(120);
    expect(config.objectStorage).toBeNull();
  });

  it('accepts a complete generic S3-compatible object-storage configuration', () => {
    const config = parseAppConfig({
      ...requiredEnvironment,
      OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
      OBJECT_STORAGE_REGION: 'us-east-1',
      OBJECT_STORAGE_BUCKET: 'private-documents',
      OBJECT_STORAGE_ACCESS_KEY_ID: 'test-access-key',
      OBJECT_STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
      OBJECT_STORAGE_FORCE_PATH_STYLE: 'false',
    });

    expect(config.objectStorage).toEqual({
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'private-documents',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      forcePathStyle: false,
    });
  });

  it('rejects partial object-storage configuration without echoing its credential', () => {
    const credential = 'partial-secret-that-must-not-be-echoed';
    const parse = () =>
      parseAppConfig({
        ...requiredEnvironment,
        OBJECT_STORAGE_SECRET_ACCESS_KEY: credential,
      });

    expect(parse).toThrow('incomplete object storage configuration');
    expect(parse).not.toThrow(credential);
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
