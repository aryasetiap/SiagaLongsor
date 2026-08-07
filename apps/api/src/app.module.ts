import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { HealthModule } from './health/health.module.js';
import { MonitoringPointsModule } from './monitoring-points/monitoring-points.module.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { RiskModule } from './risk/risk.module.js';
import { SitesModule } from './sites/sites.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import { SingleDeviceModule } from './single-device/single-device.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    DevicesModule,
    RateLimitModule,
    AuthModule,
    AuthorizationModule,
    HealthModule,
    MonitoringPointsModule,
    SitesModule,
    RiskModule,
    TelemetryModule,
    SingleDeviceModule,
  ],
})
export class AppModule {}
