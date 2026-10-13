import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { NotificationsService } from './notifications.service';
import { NotificationChecksService } from './notification-checks.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

// The bell. Every user reads only their own notifications; there is no way to
// address another user's row. The list also refreshes the few notifications
// that are derived from state rather than from an event (see
// NotificationChecksService), at most every few minutes per user.
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly checks: NotificationChecksService,
  ) {}

  @RequirePermission('notifications:read')
  @Get()
  async list(@Query() query: ListNotificationsQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    await this.checks.refreshFor(actor.id);
    return this.notifications.list(actor.id, query.limit ?? 30);
  }

  @RequirePermission('notifications:read')
  @Post('read-all')
  readAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.markAllRead(actor.id);
  }

  @RequirePermission('notifications:read')
  @Post(':id/read')
  read(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.markRead(actor.id, id);
  }
}
