import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RegistrationStationsService } from './registration-stations.service';
import { CreateRegistrationStationDto } from './dto/create-registration-station.dto';
import { UpdateRegistrationStationDto } from './dto/update-registration-station.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('registration-stations')
@Controller('registration-stations')
export class RegistrationStationsController {
  constructor(private readonly registrationStations: RegistrationStationsService) {}

  @RequirePermission('registration_stations:manage')
  @Post()
  create(@Body() dto: CreateRegistrationStationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.registrationStations.create(dto, actor.id);
  }

  // Scoped: a registration employee sees only their own station(s).
  @RequirePermission('registration_stations:read')
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.registrationStations.findAll(user.id);
  }

  @RequirePermission('registration_stations:read')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.registrationStations.findOne(id, user.id);
  }

  @RequirePermission('registration_stations:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRegistrationStationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.registrationStations.update(id, dto, actor.id);
  }
}
