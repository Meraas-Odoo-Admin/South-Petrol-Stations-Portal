import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MunicipalitiesService } from './municipalities.service';
import { CreateMunicipalityDto } from './dto/create-municipality.dto';
import { UpdateMunicipalityDto } from './dto/update-municipality.dto';
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

  @RequirePermission('municipalities:read')
  @Get()
  findAll() {
    return this.municipalities.findAll();
  }

  @RequirePermission('municipalities:read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.municipalities.findOne(id);
  }

  // Two kinds of caller: municipalities:manage may change anything;
  // municipalities:set_stage_dates (the directorate admin) may change the two
  // stage dates and nothing else — the service refuses any other field for
  // them, so a hand-made request cannot switch a municipality live or rename it.
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
}
