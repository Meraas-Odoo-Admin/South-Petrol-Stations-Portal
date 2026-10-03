import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RegistrationDesksService } from './registration-desks.service';
import { CreateRegistrationDeskDto } from './dto/create-registration-desk.dto';
import { UpdateRegistrationDeskDto } from './dto/update-registration-desk.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('registration-desks')
@Controller()
export class RegistrationDesksController {
  constructor(private readonly desks: RegistrationDesksService) {}

  @RequirePermission('registration_stations:read')
  @Get('registration-stations/:id/desks')
  list(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.desks.list(id, user.id);
  }

  @RequirePermission('registration_stations:manage')
  @Post('registration-stations/:id/desks')
  create(@Param('id') id: string, @Body() dto: CreateRegistrationDeskDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.desks.create(id, dto, actor.id);
  }

  @RequirePermission('registration_stations:manage')
  @Patch('registration-desks/:id')
  update(@Param('id') id: string, @Body() dto: UpdateRegistrationDeskDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.desks.update(id, dto, actor.id);
  }
}
