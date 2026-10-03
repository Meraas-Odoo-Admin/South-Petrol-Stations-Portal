import { Module } from '@nestjs/common';
import { SecurityAuthoritiesController } from './security-authorities.controller';
import { SecurityAuthoritiesService } from './security-authorities.service';

@Module({
  controllers: [SecurityAuthoritiesController],
  providers: [SecurityAuthoritiesService],
  exports: [SecurityAuthoritiesService],
})
export class SecurityAuthoritiesModule {}
