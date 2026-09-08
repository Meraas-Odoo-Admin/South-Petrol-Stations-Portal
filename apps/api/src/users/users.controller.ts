import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { AssignPermissionDto } from './dto/assign-permission.dto';
import { AssignStationScopeDto } from './dto/assign-station-scope.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermission('users:manage')
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.create(dto, actor.id);
  }

  @RequirePermission('users:manage')
  @Get()
  findAll() {
    return this.users.findAll();
  }

  @RequirePermission('users:manage')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @RequirePermission('roles:manage')
  @Post(':id/roles')
  assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.assignRole(id, dto.roleId, actor.id);
  }

  @RequirePermission('roles:manage')
  @Delete(':id/roles/:roleId')
  removeRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.removeRole(id, roleId, actor.id);
  }

  // Same gate as role assignment — granting a permission directly to a
  // user is exactly as consequential as granting it via a role.
  @RequirePermission('roles:manage')
  @Post(':id/permissions')
  grantPermission(
    @Param('id') id: string,
    @Body() dto: AssignPermissionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.grantPermission(id, dto.permissionId, actor.id);
  }

  @RequirePermission('roles:manage')
  @Delete(':id/permissions/:permissionId')
  revokePermission(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.revokePermission(id, permissionId, actor.id);
  }

  @RequirePermission('users:manage')
  @Post(':id/station-scope')
  addStationScope(
    @Param('id') id: string,
    @Body() dto: AssignStationScopeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.addStationScope(id, dto.stationId, actor.id);
  }

  @RequirePermission('users:manage')
  @Delete(':id/station-scope/:stationId')
  removeStationScope(
    @Param('id') id: string,
    @Param('stationId') stationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.removeStationScope(id, stationId, actor.id);
  }
}
