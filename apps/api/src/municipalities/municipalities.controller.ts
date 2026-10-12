import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MunicipalitiesService } from './municipalities.service';
import { CreateMunicipalityDto } from './dto/create-municipality.dto';
import { UpdateMunicipalityDto } from './dto/update-municipality.dto';
import { ListMunicipalitiesQueryDto } from './dto/list-municipalities-query.dto';
import { ArchiveMunicipalityDto, RestoreDto } from './dto/archive-municipality.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequireAnyPermission } from '../common/decorators/require-any-permission.decorator';
import { RbacService } from '../rbac/rbac.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('municipalities')
@Controller('municipalities')
export class MunicipalitiesController {
  constructor(
    private readonly municipalities: MunicipalitiesService,
    private readonly rbac: RbacService,
  ) {}

  @RequirePermission('municipalities:manage')
  @Post()
  create(@Body() dto: CreateMunicipalityDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.municipalities.create(dto, actor.id);
  }

  // Scoped in the service: a municipality manager lists only their own.
  @RequirePermission('municipalities:read')
  @Get()
  findAll(@Query() query: ListMunicipalitiesQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.municipalities.findAll(actor.id, query);
  }

  // Everything about one municipality: stations, offices, people by job,
  // stage and dates, activity. Declared before ':id' so it isn't read as an id.
  @RequireAnyPermission('municipalities:manage', 'municipalities:set_stage_dates')
  @Get(':id/overview')
  overview(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.municipalities.overview(id, actor.id);
  }

  @RequirePermission('municipalities:read')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.municipalities.findOne(id, actor.id);
  }

  // Two kinds of caller: municipalities:manage may change anything;
  // municipalities:set_stage_dates (the municipality manager) may change the
  // two stage dates and nothing else - the service refuses any other field
  // for them, and refuses any municipality outside their own.
  @RequireAnyPermission('municipalities:manage', 'municipalities:set_stage_dates')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMunicipalityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const held = await this.rbac.getPermissionsForUser(actor.id);
    return this.municipalities.update(id, dto, actor.id, { stageDatesOnly: !held.has('municipalities:manage') });
  }

  @RequirePermission('municipalities:manage')
  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id') id: string, @Body() dto: ArchiveMunicipalityDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.municipalities.archive(id, dto, actor.id);
  }

  @RequirePermission('municipalities:manage')
  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string, @Body() dto: RestoreDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.municipalities.restore(id, dto, actor.id);
  }
}
