import { Global, Module } from '@nestjs/common';

import { APP_CONFIG, parseAppConfig } from './app-config.js';
import { loadEnvironment } from './load-environment.js';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => {
        loadEnvironment();
        return parseAppConfig(process.env);
      },
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
