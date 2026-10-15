import { Module } from '@nestjs/common';
import { RegistrationStationsController } from './registration-stations.controller';
import { RegistrationStationsService } from './registration-stations.service';

@Module({
  controllers: [RegistrationStationsController],
  providers: [RegistrationStationsService],
  exports: [RegistrationStationsService],
})
export class RegistrationStationsModule {}
