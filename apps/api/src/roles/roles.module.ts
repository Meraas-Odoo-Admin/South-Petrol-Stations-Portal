import { Module } from '@nestjs/common';
import { RolesController, PermissionsController } from './roles.controller';

@Module({
  controllers: [RolesController, PermissionsController],
})
export class RolesModule {}
