import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StationsService } from './stations.service';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { ListStationsQueryDto } from './dto/list-stations-query.dto';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { RestoreDto } from '../municipalities/dto/archive-municipality.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('stations')
@Controller('stations')
export class StationsController {
  constructor(private readonly stations: StationsService) {}

  @RequirePermission('stations:create')
  @Post()
  create(@Body() dto: CreateStationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stations.create(dto, actor.id);
  }

  @RequirePermission('stations:read')
  @Get()
  // With skip/take: one page and the total, {total, skip, take, items}. Without:
  // the picker list (every station the caller may choose, at most 200).
  findAll(@Query() query: ListStationsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return query.skip !== undefined || query.take !== undefined
      ? this.stations.findPage(user.id, query)
      : this.stations.findAll(user.id, query);
  }

  @RequirePermission('stations:read')
  @Get(':id/activity')
  activity(@Param('id') id: string, @Query() query: PageQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.stations.activity(id, user.id, query);
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

  // Phase 5A: "delete" means archive (history stays), restored by the level
  // that archived it. Municipality managers and the super admin only.
  @RequirePermission('stations:create')
  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id') id: string, @Body() dto: RestoreDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stations.archive(id, dto.reason, actor.id);
  }

  @RequirePermission('stations:create')
  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string, @Body() dto: RestoreDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stations.restore(id, dto.reason, actor.id);
  }
}
