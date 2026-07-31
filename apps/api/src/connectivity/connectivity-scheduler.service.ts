import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { ConnectivityEvaluatorService } from './connectivity-evaluator.service.js';

const cadenceMilliseconds = 5 * 60_000;

@Injectable()
export class ConnectivitySchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectivitySchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly evaluator: ConnectivityEvaluatorService,
  ) {}

  onModuleInit(): void {
    if (this.config.nodeEnv === 'test' || this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.evaluator.runOnce(new Date()).catch((error: unknown) => {
        this.logger.error(
          `Connectivity evaluator failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      });
    }, cadenceMilliseconds);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
