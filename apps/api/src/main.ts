import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap/configure-app.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { loadEnvironment } from './config/load-environment.js';

loadEnvironment();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const config = app.get<AppConfig>(APP_CONFIG);

  await app.listen(config.port);
}

void bootstrap();
