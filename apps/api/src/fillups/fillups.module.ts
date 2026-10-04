import { Module } from '@nestjs/common';
import { FillUpsController } from './fillups.controller';
import { FillUpsService } from './fillups.service';
import { FillUpsRepository, StandingExceptionsRepository } from './fillups.repository';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { RegistrationStationsModule } from '../registration-stations/registration-stations.module';

@Module({
  imports: [SystemSettingsModule, RegistrationStationsModule],
  controllers: [FillUpsController],
  providers: [FillUpsService, FillUpsRepository, StandingExceptionsRepository],
  exports: [FillUpsService],
})
export class FillUpsModule {}
