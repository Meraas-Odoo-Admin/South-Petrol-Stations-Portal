import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersAccountsService } from './users-accounts.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersAccountsService],
  exports: [UsersService, UsersAccountsService],
})
export class UsersModule {}
