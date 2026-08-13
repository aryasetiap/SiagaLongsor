import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import type { TelegramDeliveryResult } from './notification.types.js';

const requestTimeoutMilliseconds = 10_000;

@Injectable()
export class TelegramClientService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async sendMessage(text: string): Promise<TelegramDeliveryResult> {
    const { botToken, chatId, messageThreadId } = this.config.telegram;
    if (!this.config.telegram.enabled || botToken === null || chatId === null) {
      return failure(false, 'TELEGRAM_DISABLED', 'Telegram notifications are not configured.');
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          ...(messageThreadId === null ? {} : { message_thread_id: messageThreadId }),
        }),
        signal: AbortSignal.timeout(requestTimeoutMilliseconds),
      });
      const body = await readResponse(response);
      if (response.ok && body.ok === true && isRecord(body.result)) {
        const messageId = body.result.message_id;
        if (typeof messageId === 'number' || typeof messageId === 'string') {
          return { delivered: true, messageId: String(messageId) };
        }
      }

      const status = numberOr(body.error_code, response.status);
      const retryAfterSeconds = retryAfter(body);
      const retryable = status === 408 || status === 429 || status >= 500;
      return failure(
        retryable,
        `TELEGRAM_${status}`,
        sanitizeDescription(body.description, botToken),
        retryAfterSeconds,
      );
    } catch {
      return failure(true, 'TELEGRAM_NETWORK_ERROR', 'Telegram request failed.');
    }
  }
}

function failure(
  retryable: boolean,
  code: string,
  message: string,
  retryAfterSeconds: number | null = null,
): TelegramDeliveryResult {
  return { delivered: false, retryable, code, message, retryAfterSeconds };
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function retryAfter(body: Record<string, unknown>): number | null {
  if (!isRecord(body.parameters)) return null;
  const value = body.parameters.retry_after;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Math.ceil(value), 3_600)
    : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

function sanitizeDescription(value: unknown, token: string): string {
  if (typeof value !== 'string' || value.length === 0) return 'Telegram rejected the request.';
  return value.replaceAll(token, '[redacted]').slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
