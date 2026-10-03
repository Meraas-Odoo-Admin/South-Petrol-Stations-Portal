import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StandingExceptionsService } from './standing-exceptions.service';
import { CreateStandingExceptionDto } from './dto/create-standing-exception.dto';
import { FindStandingExceptionsQueryDto } from './dto/find-standing-exceptions-query.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('standing-exceptions')
@Controller('standing-exceptions')
export class StandingExceptionsController {
  constructor(private readonly standingExceptions: StandingExceptionsService) {}

  @RequirePermission('standing_exceptions:manage')
  @Post()
  create(@Body() dto: CreateStandingExceptionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.standingExceptions.create(dto, actor.id);
  }

  @RequirePermission('standing_exceptions:manage')
  @Post(':id/revoke')
  revoke(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.standingExceptions.revoke(id, actor.id);
  }

  // Gated on vehicles:read, not standing_exceptions:manage — "visible
  // directly on the owner/vehicle's own profile page" means anyone who
  // can already view that profile should see active grants on it, not
  // just whoever can grant/revoke them. Every seeded role that can reach a
  // vehicle detail page holds vehicles:read.
  @RequirePermission('vehicles:read')
  @Get()
  findAll(@Query() query: FindStandingExceptionsQueryDto) {
    return this.standingExceptions.findAll(query);
  }
}
