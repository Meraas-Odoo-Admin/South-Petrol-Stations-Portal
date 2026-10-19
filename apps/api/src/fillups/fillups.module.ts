import { CitizenStatusController } from './citizen-status.controller';
import { Module } from '@nestjs/common';
import { FillUpsController } from './fillups.controller';
import { FillUpsService } from './fillups.service';
import { FillUpsRepository } from './fillups.repository';
import { ExceptionsService } from './exceptions.service';
import { ExceptionsController } from './exceptions.controller';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { RegistrationStationsModule } from '../registration-stations/registration-stations.module';
import { FuelStockModule } from '../fuel-stock/fuel-stock.module';

@Module({
  imports: [SystemSettingsModule, RegistrationStationsModule, FuelStockModule],
  controllers: [FillUpsController, ExceptionsController, CitizenStatusController],
  providers: [FillUpsService, FillUpsRepository, ExceptionsService],
  exports: [FillUpsService, ExceptionsService],
})
export class FillUpsModule {}
