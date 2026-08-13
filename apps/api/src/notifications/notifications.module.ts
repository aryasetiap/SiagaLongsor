import { Module } from '@nestjs/common';

import { NotificationOutboxService } from './notification-outbox.service.js';
import { NotificationWorkerService } from './notification-worker.service.js';
import { TelegramClientService } from './telegram-client.service.js';

@Module({
  providers: [NotificationOutboxService, NotificationWorkerService, TelegramClientService],
  exports: [NotificationOutboxService],
})
export class NotificationsModule {}
