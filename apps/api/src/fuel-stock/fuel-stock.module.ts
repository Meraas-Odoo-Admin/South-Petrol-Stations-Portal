import { Module } from '@nestjs/common';
import { FuelStockController } from './fuel-stock.controller';
import { FuelStockService } from './fuel-stock.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [SystemSettingsModule],
  controllers: [FuelStockController],
  providers: [FuelStockService],
  exports: [FuelStockService],
})
export class FuelStockModule {}
