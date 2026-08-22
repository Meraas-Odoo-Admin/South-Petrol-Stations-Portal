import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StationsService } from './stations.service';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('stations')
@Controller('stations')
export class StationsController {
  constructor(private readonly stations: StationsService) {}

  @RequirePermission('stations:manage')
  @Post()
  create(@Body() dto: CreateStationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stations.create(dto, actor.id);
  }

  @RequirePermission('stations:read')
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.stations.findAll(user.id);
  }

  @RequirePermission('stations:read')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.stations.findOne(id, user.id);
  }

  @RequirePermission('stations:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.stations.update(id, dto, actor.id, actor.id);
  }
}
