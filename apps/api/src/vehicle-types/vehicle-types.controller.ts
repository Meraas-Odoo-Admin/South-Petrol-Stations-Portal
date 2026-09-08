import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VehicleTypesService } from './vehicle-types.service';
import { CreateVehicleTypeDto } from './dto/create-vehicle-type.dto';
import { UpdateVehicleTypeDto } from './dto/update-vehicle-type.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('vehicle-types')
@Controller('vehicle-types')
export class VehicleTypesController {
  constructor(private readonly vehicleTypes: VehicleTypesService) {}

  @RequirePermission('vehicle_types:manage')
  @Post()
  create(@Body() dto: CreateVehicleTypeDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.vehicleTypes.create(dto, actor.id);
  }

  @RequirePermission('vehicle_types:read')
  @Get()
  findAll() {
    return this.vehicleTypes.findAll();
  }

  @RequirePermission('vehicle_types:read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehicleTypes.findOne(id);
  }

  @RequirePermission('vehicle_types:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleTypeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vehicleTypes.update(id, dto, actor.id);
  }
}
