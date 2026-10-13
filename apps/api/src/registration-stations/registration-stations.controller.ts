import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ListRegistrationStationsQueryDto } from './dto/list-registration-stations-query.dto';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { RestoreDto } from '../municipalities/dto/archive-municipality.dto';
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

  // Scoped: a registration employee sees only their own station(s); a
  // municipality manager sees every office of their municipality.
  @RequirePermission('registration_stations:read')
  @Get()
  // With skip/take: one page and the total. Without: the picker list (at most 200).
  findAll(@Query() query: ListRegistrationStationsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return query.skip !== undefined || query.take !== undefined
      ? this.registrationStations.findPage(user.id, query)
      : this.registrationStations.findAll(user.id, query);
  }

  @RequirePermission('registration_stations:read')
  @Get(':id/activity')
  activity(@Param('id') id: string, @Query() query: PageQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.registrationStations.activity(id, user.id, query);
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

  // Phase 5A: "delete" means archive; the level that archived it restores it.
  @RequirePermission('registration_stations:manage')
  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id') id: string, @Body() dto: RestoreDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.registrationStations.archive(id, dto.reason, actor.id);
  }

  @RequirePermission('registration_stations:manage')
  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string, @Body() dto: RestoreDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.registrationStations.restore(id, dto.reason, actor.id);
  }
}
