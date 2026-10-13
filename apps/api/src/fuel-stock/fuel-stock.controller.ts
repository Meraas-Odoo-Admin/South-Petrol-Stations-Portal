import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FuelType } from '@prisma/client';
import { RequireAnyPermission } from '../common/decorators/require-any-permission.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { FuelStockService } from './fuel-stock.service';
import {
  ConfigureStorageDto,
  CorrectDeliveryDto,
  RecordDeliveryDto,
  ResetLevelDto,
  StockEntriesQueryDto,
  StockVisibilityDto,
} from './dto/fuel-stock.dto';

// Fuel storage at stations (phase 5B). There is deliberately no PATCH and no
// DELETE on entries: they are insert-only, and a mistake is a correction.
@ApiTags('fuel-stock')
@Controller()
export class FuelStockController {
  constructor(private readonly stock: FuelStockService) {}

  // Levels per fuel type. Employees get them only while the station shows
  // stock to employees; the service enforces that, not the screen.
  @RequireAnyPermission('fuel_stock:read', 'fuel_stock:read_visible')
  @Get('stations/:stationId/fuel-stock')
  levels(@Param('stationId') stationId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.stock.levels(stationId, actor.id);
  }

  @RequirePermission('fuel_stock:read')
  @Get('stations/:stationId/fuel-stock/entries')
  entries(
    @Param('stationId') stationId: string,
    @Query() query: StockEntriesQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.stock.listEntries(stationId, query, actor.id);
  }

  @RequirePermission('fuel_stock:manage')
  @Put('stations/:stationId/fuel-stock/:fuelType/storage')
  configure(
    @Param('stationId') stationId: string,
    @Param('fuelType', new ParseEnumPipe(FuelType)) fuelType: FuelType,
    @Body() dto: ConfigureStorageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.stock.configure(stationId, fuelType, dto, actor.id);
  }

  @RequirePermission('fuel_stock:manage')
  @Post('stations/:stationId/fuel-stock/:fuelType/deliveries')
  deliver(
    @Param('stationId') stationId: string,
    @Param('fuelType', new ParseEnumPipe(FuelType)) fuelType: FuelType,
    @Body() dto: RecordDeliveryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.stock.recordDelivery(stationId, fuelType, dto, actor.id);
  }

  @RequirePermission('fuel_stock:manage')
  @Post('fuel-stock/entries/:id/corrections')
  correct(@Param('id') id: string, @Body() dto: CorrectDeliveryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stock.correctDelivery(id, dto, actor.id);
  }

  @RequirePermission('fuel_stock:manage')
  @Post('stations/:stationId/fuel-stock/:fuelType/reset')
  reset(
    @Param('stationId') stationId: string,
    @Param('fuelType', new ParseEnumPipe(FuelType)) fuelType: FuelType,
    @Body() dto: ResetLevelDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.stock.reset(stationId, fuelType, dto, actor.id);
  }

  @RequirePermission('fuel_stock:manage')
  @Patch('stations/:stationId/stock-visibility')
  visibility(
    @Param('stationId') stationId: string,
    @Body() dto: StockVisibilityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.stock.setVisibility(stationId, dto.show, actor.id);
  }
}
