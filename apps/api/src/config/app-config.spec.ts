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
    expect(config.host).toBe('0.0.0.0');
    expect(config.publicDashboard.hardwareId).toBeNull();
    expect(config.auth.accessTokenTtlSeconds).toBe(900);
    expect(config.auth.refreshTokenTtlSeconds).toBe(2_592_000);
    expect(config.auth.loginRateLimitMax).toBe(5);
    expect(config.telemetry.maxFutureSkewSeconds).toBe(300);
    expect(config.telemetry.rateLimitTtlMs).toBe(60_000);
    expect(config.telemetry.rateLimitMax).toBe(120);
    expect(config.telegram).toMatchObject({
      enabled: false,
      botToken: null,
      chatId: null,
      messageThreadId: null,
      dashboardUrl: 'http://localhost:3000/overview',
    });
  });

  it('uses an explicit API host when configured', () => {
    const config = parseAppConfig({
      ...requiredEnvironment,
      API_HOST: '127.0.0.1',
    });

    expect(config.host).toBe('127.0.0.1');
  });

  it('requires Telegram credentials only when delivery is enabled', () => {
    expect(() =>
      parseAppConfig({
        ...requiredEnvironment,
        TELEGRAM_NOTIFICATIONS_ENABLED: 'true',
      }),
    ).toThrow('TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID');

    const config = parseAppConfig({
      ...requiredEnvironment,
      TELEGRAM_NOTIFICATIONS_ENABLED: 'true',
      TELEGRAM_BOT_TOKEN: '123456789:development-token-value',
      TELEGRAM_CHAT_ID: '-1001234567890',
      TELEGRAM_MESSAGE_THREAD_ID: '42',
      TELEGRAM_DASHBOARD_URL: 'https://siagalongsor.example/overview',
    });
    expect(config.telegram).toEqual({
      enabled: true,
      botToken: '123456789:development-token-value',
      chatId: '-1001234567890',
      messageThreadId: 42,
      dashboardUrl: 'https://siagalongsor.example/overview',
    });
  });

  it('accepts empty optional Telegram values while delivery is disabled', () => {
    expect(
      parseAppConfig({
        ...requiredEnvironment,
        TELEGRAM_BOT_TOKEN: '',
        TELEGRAM_CHAT_ID: '',
        TELEGRAM_MESSAGE_THREAD_ID: '',
        TELEGRAM_DASHBOARD_URL: '',
      }).telegram.enabled,
    ).toBe(false);
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
