import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap/configure-app.js';
import { startApi } from './bootstrap/start-api.js';
import { loadEnvironment } from './config/load-environment.js';

loadEnvironment();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  await startApi(app);
}

void bootstrap();
