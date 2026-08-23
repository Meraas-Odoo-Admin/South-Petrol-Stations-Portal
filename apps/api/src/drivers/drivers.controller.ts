import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('drivers')
@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @RequirePermission('drivers:manage')
  @Post()
  create(@Body() dto: CreateDriverDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.drivers.create(dto, actor.id);
  }

  @RequirePermission('drivers:read')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.drivers.findAll(query);
  }

  @RequirePermission('drivers:read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.drivers.findOne(id);
  }

  @RequirePermission('drivers:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDriverDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.drivers.update(id, dto, actor.id);
  }
}
