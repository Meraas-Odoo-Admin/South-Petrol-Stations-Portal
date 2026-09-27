import { Module } from '@nestjs/common';
import { OwnersController } from './owners.controller';
import { OwnersService } from './owners.service';
import { RegistrationStationsModule } from '../registration-stations/registration-stations.module';

@Module({
  imports: [RegistrationStationsModule],
  controllers: [OwnersController],
  providers: [OwnersService],
  exports: [OwnersService],
})
export class OwnersModule {}
