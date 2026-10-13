import { Module } from '@nestjs/common';
import { OpsReportsController } from './ops-reports.controller';
import { OpsReportsService } from './ops-reports.service';
import { FuelStockModule } from '../fuel-stock/fuel-stock.module';
import { CardStockModule } from '../card-stock/card-stock.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [FuelStockModule, CardStockModule, ReadinessModule, SystemSettingsModule],
  controllers: [OpsReportsController],
  providers: [OpsReportsService],
})
export class OpsReportsModule {}
