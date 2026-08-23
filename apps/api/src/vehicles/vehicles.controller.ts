import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { FindVehiclesQueryDto } from './dto/find-vehicles-query.dto';
import { AddVehicleDriverDto } from './dto/add-vehicle-driver.dto';
import { PlateChangeDto } from './dto/plate-change.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('vehicles')
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @RequirePermission('vehicles:manage')
  @Post()
  create(@Body() dto: CreateVehicleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.vehicles.create(dto, actor.id);
  }

  @RequirePermission('vehicles:read')
  @Get()
  findAll(@Query() query: FindVehiclesQueryDto) {
    return this.vehicles.findAll(query);
  }

  @RequirePermission('vehicles:read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehicles.findOne(id);
  }

  @RequirePermission('vehicles:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vehicles.update(id, dto, actor.id);
  }

  @RequirePermission('vehicles:manage')
  @Post(':id/plate-change')
  changePlate(
    @Param('id') id: string,
    @Body() dto: PlateChangeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vehicles.changePlate(id, dto, actor.id);
  }

  @RequirePermission('vehicles:manage')
  @Post(':id/drivers')
  addDriver(
    @Param('id') id: string,
    @Body() dto: AddVehicleDriverDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vehicles.addDriver(id, dto.driverId, dto.isPrimary ?? false, actor.id);
  }

  @RequirePermission('vehicles:manage')
  @Delete(':id/drivers/:driverId')
  removeDriver(
    @Param('id') id: string,
    @Param('driverId') driverId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vehicles.removeDriver(id, driverId, actor.id);
  }
}
