import { Module } from '@nestjs/common';
import { RegistrationStationsController } from './registration-stations.controller';
import { RegistrationStationsService } from './registration-stations.service';
import { RegistrationDesksController } from './registration-desks.controller';
import { RegistrationDesksService } from './registration-desks.service';

@Module({
  controllers: [RegistrationStationsController, RegistrationDesksController],
  providers: [RegistrationStationsService, RegistrationDesksService],
  exports: [RegistrationStationsService, RegistrationDesksService],
})
export class RegistrationStationsModule {}
