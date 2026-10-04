import { Module } from '@nestjs/common';
import { RegistrationSheetController } from './registration-sheet.controller';
import { RegistrationSheetService } from './registration-sheet.service';
import { RegistrationStationsModule } from '../registration-stations/registration-stations.module';
import { CardsModule } from '../cards/cards.module';

@Module({
  imports: [RegistrationStationsModule, CardsModule],
  controllers: [RegistrationSheetController],
  providers: [RegistrationSheetService],
})
export class RegistrationSheetModule {}
