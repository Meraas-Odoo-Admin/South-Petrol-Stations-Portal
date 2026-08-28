import { Module } from '@nestjs/common';
import { StandingExceptionsController } from './standing-exceptions.controller';
import { StandingExceptionsService } from './standing-exceptions.service';

@Module({
  controllers: [StandingExceptionsController],
  providers: [StandingExceptionsService],
})
export class StandingExceptionsModule {}
