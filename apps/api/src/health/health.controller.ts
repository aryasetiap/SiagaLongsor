import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { Public } from '../authorization/public.decorator.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  async getHealth(): Promise<{ status: 'ok'; database: 'up'; redis: 'up' }> {
    const dependencies = await this.healthService.check();

    if (!dependencies.database || !dependencies.redis) {
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Satu atau lebih dependency tidak tersedia.',
        details: {
          database: dependencies.database ? 'up' : 'down',
          redis: dependencies.redis ? 'up' : 'down',
        },
      });
    }

    return {
      status: 'ok',
      database: 'up',
      redis: 'up',
    };
  }
}
