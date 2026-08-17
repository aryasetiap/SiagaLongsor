import { z } from 'zod';

const optionalString = <Schema extends z.ZodType<string>>(schema: Schema) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  );

const optionalInteger = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    API_HOST: z.string().trim().min(1).max(255).default('0.0.0.0'),
    API_TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
    WEB_URL: z.url().default('http://localhost:3000'),
    DATABASE_URL: z.string().min(1),
    PUBLIC_DEVICE_HARDWARE_ID: z.string().trim().min(3).max(64).optional(),
    AUTH_ACCESS_TOKEN_SECRET: z.string().min(32),
    AUTH_JWT_ISSUER: z.string().min(1).default('siagalongsor-api'),
    AUTH_JWT_AUDIENCE: z.string().min(1).default('siagalongsor-web'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(3_600)
      .max(60 * 60 * 24 * 90)
      .default(60 * 60 * 24 * 30),
    AUTH_REFRESH_COOKIE_NAME: z.string().min(1).default('siagalongsor_refresh'),
    AUTH_LOGIN_RATE_LIMIT_TTL_MS: z.coerce.number().int().min(1_000).default(60_000),
    AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),
    TELEMETRY_MAX_FUTURE_SKEW_SECONDS: z.coerce.number().int().min(0).max(3_600).default(300),
    TELEMETRY_RATE_LIMIT_TTL_MS: z.coerce.number().int().min(1_000).default(60_000),
    TELEMETRY_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
    TELEGRAM_NOTIFICATIONS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    TELEGRAM_BOT_TOKEN: optionalString(z.string().trim().min(20).max(256)),
    TELEGRAM_CHAT_ID: optionalString(z.string().trim().min(1).max(128)),
    TELEGRAM_MESSAGE_THREAD_ID: optionalInteger,
    TELEGRAM_DASHBOARD_URL: optionalString(z.url()),
  })
  .superRefine((value, context) => {
    if (!value.TELEGRAM_NOTIFICATIONS_ENABLED) return;
    if (value.TELEGRAM_BOT_TOKEN === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['TELEGRAM_BOT_TOKEN'],
        message: 'required when Telegram notifications are enabled',
      });
    }
    if (value.TELEGRAM_CHAT_ID === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['TELEGRAM_CHAT_ID'],
        message: 'required when Telegram notifications are enabled',
      });
    }
  });

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly host: string;
  readonly trustProxyHops: number;
  readonly webUrl: string;
  readonly databaseUrl: string;
  readonly publicDashboard: {
    readonly hardwareId: string | null;
  };
  readonly auth: {
    readonly accessTokenSecret: string;
    readonly issuer: string;
    readonly audience: string;
    readonly accessTokenTtlSeconds: number;
    readonly refreshTokenTtlSeconds: number;
    readonly refreshCookieName: string;
    readonly loginRateLimitTtlMs: number;
    readonly loginRateLimitMax: number;
  };
  readonly telemetry: {
    readonly maxFutureSkewSeconds: number;
    readonly rateLimitTtlMs: number;
    readonly rateLimitMax: number;
  };
  readonly telegram: {
    readonly enabled: boolean;
    readonly botToken: string | null;
    readonly chatId: string | null;
    readonly messageThreadId: number | null;
    readonly dashboardUrl: string;
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export function parseAppConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const parsed = environmentSchema.safeParse(environment);

  if (!parsed.success) {
    const invalidFields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid application configuration: ${invalidFields}`);
  }

  const value = parsed.data;
  return Object.freeze({
    nodeEnv: value.NODE_ENV,
    port: value.API_PORT,
    host: value.API_HOST,
    trustProxyHops: value.API_TRUST_PROXY_HOPS,
    webUrl: value.WEB_URL,
    databaseUrl: value.DATABASE_URL,
    publicDashboard: Object.freeze({
      hardwareId: value.PUBLIC_DEVICE_HARDWARE_ID ?? null,
    }),
    auth: Object.freeze({
      accessTokenSecret: value.AUTH_ACCESS_TOKEN_SECRET,
      issuer: value.AUTH_JWT_ISSUER,
      audience: value.AUTH_JWT_AUDIENCE,
      accessTokenTtlSeconds: value.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlSeconds: value.AUTH_REFRESH_TOKEN_TTL_SECONDS,
      refreshCookieName: value.AUTH_REFRESH_COOKIE_NAME,
      loginRateLimitTtlMs: value.AUTH_LOGIN_RATE_LIMIT_TTL_MS,
      loginRateLimitMax: value.AUTH_LOGIN_RATE_LIMIT_MAX,
    }),
    telemetry: Object.freeze({
      maxFutureSkewSeconds: value.TELEMETRY_MAX_FUTURE_SKEW_SECONDS,
      rateLimitTtlMs: value.TELEMETRY_RATE_LIMIT_TTL_MS,
      rateLimitMax: value.TELEMETRY_RATE_LIMIT_MAX,
    }),
    telegram: Object.freeze({
      enabled: value.TELEGRAM_NOTIFICATIONS_ENABLED,
      botToken: value.TELEGRAM_BOT_TOKEN ?? null,
      chatId: value.TELEGRAM_CHAT_ID ?? null,
      messageThreadId: value.TELEGRAM_MESSAGE_THREAD_ID ?? null,
      dashboardUrl: value.TELEGRAM_DASHBOARD_URL ?? `${value.WEB_URL}/overview`,
    }),
  });
}
