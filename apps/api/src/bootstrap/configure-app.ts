import { randomUUID } from 'node:crypto';

import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Response } from 'express';
import helmet from 'helmet';

import { ApiExceptionFilter } from '../common/http/api-exception.filter.js';
import type { RequestWithContext } from '../common/http/request-context.js';
import { createValidationException } from '../common/http/validation-errors.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

export function configureApp(app: NestExpressApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);

  app.setGlobalPrefix('api/v1');
  if (config.trustProxyHops > 0) {
    app.set('trust proxy', config.trustProxyHops);
  }
  app.use((request: RequestWithContext, response: Response, next: NextFunction) => {
    request.requestId = resolveRequestId(request.get('x-request-id'));
    response.setHeader('x-request-id', request.requestId);
    next();
  });
  app.use(cookieParser());
  app.use(helmet());
  app.enableCors({
    origin: config.webUrl,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.useBodyParser('json', { limit: '64kb' });
  app.useBodyParser('urlencoded', { extended: false, limit: '64kb' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: createValidationException,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
}

function resolveRequestId(candidate: string | undefined): string {
  return candidate !== undefined && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)
    ? candidate
    : randomUUID();
}
