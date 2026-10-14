import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationChecksService } from './notification-checks.service';

// Global: features call NotificationsService without importing this module.
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationChecksService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
