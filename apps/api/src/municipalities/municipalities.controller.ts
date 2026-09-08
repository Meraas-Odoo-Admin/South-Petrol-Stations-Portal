import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MunicipalitiesService } from './municipalities.service';
import { CreateMunicipalityDto } from './dto/create-municipality.dto';
import { UpdateMunicipalityDto } from './dto/update-municipality.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('municipalities')
@Controller('municipalities')
export class MunicipalitiesController {
  constructor(private readonly municipalities: MunicipalitiesService) {}

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

  @RequirePermission('municipalities:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMunicipalityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.municipalities.update(id, dto, actor.id);
  }
}
