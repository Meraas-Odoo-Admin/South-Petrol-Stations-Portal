import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationChecksService } from './notification-checks.service';
import { CardStockModule } from '../card-stock/card-stock.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

// Global: features call NotificationsService without importing this module.
@Global()
@Module({
  imports: [CardStockModule, ReadinessModule, SystemSettingsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationChecksService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
