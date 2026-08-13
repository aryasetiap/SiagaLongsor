import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseAppConfig } from '../config/app-config.js';
import { TelegramClientService } from './telegram-client.service.js';

const config = parseAppConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@localhost:55432/database',
  AUTH_ACCESS_TOKEN_SECRET: 'a-development-only-secret-with-32-characters',
  TELEGRAM_NOTIFICATIONS_ENABLED: 'true',
  TELEGRAM_BOT_TOKEN: '123456789:test-token-that-is-long-enough',
  TELEGRAM_CHAT_ID: '-1001234567890',
});

describe('TelegramClientService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the Telegram message identifier after successful delivery', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 123 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', request);

    await expect(new TelegramClientService(config).sendMessage('test')).resolves.toEqual({
      delivered: true,
      messageId: '123',
    });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[1]?.body).not.toContain(config.telegram.botToken);
  });

  it('uses Telegram retry_after for rate-limited delivery', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error_code: 429,
            description: 'Too Many Requests',
            parameters: { retry_after: 12 },
          }),
          { status: 429, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(new TelegramClientService(config).sendMessage('test')).resolves.toMatchObject({
      delivered: false,
      retryable: true,
      code: 'TELEGRAM_429',
      retryAfterSeconds: 12,
    });
  });

  it('treats an invalid bot credential as a permanent failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ ok: false, error_code: 401, description: 'Unauthorized' }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          ),
        ),
    );

    await expect(new TelegramClientService(config).sendMessage('test')).resolves.toMatchObject({
      delivered: false,
      retryable: false,
      code: 'TELEGRAM_401',
    });
  });
});
