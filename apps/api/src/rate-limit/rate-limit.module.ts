import { Global, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { AppConfigModule } from '../config/app-config.module.js';

@Global()
@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => [
        {
          ttl: config.auth.loginRateLimitTtlMs,
          limit: config.auth.loginRateLimitMax,
        },
      ],
    }),
  ],
  exports: [ThrottlerModule],
})
export class RateLimitModule {}
