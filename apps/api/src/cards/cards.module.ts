import { Module } from '@nestjs/common';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { CardRendererService } from './render/card-renderer.service';
import { RegistrationStationsModule } from '../registration-stations/registration-stations.module';

@Module({
  imports: [RegistrationStationsModule],
  controllers: [CardsController],
  providers: [CardsService, CardRendererService],
})
export class CardsModule {}
