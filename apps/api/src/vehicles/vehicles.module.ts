import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { RegistrationStationsModule } from '../registration-stations/registration-stations.module';

@Module({
  imports: [SystemSettingsModule, RegistrationStationsModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
