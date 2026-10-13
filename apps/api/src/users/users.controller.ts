import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UsersAccountsService } from './users-accounts.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetJobDto } from './dto/set-job.dto';
import { SetPlacesDto } from './dto/set-places.dto';
import { ReasonDto } from './dto/reason.dto';
import { RequireAnyPermission } from '../common/decorators/require-any-permission.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { AssignPermissionDto } from './dto/assign-permission.dto';
import { AssignRegistrationStationScopeDto } from './dto/assign-registration-station-scope.dto';
import { AssignStationScopeDto } from './dto/assign-station-scope.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RbacService } from '../rbac/rbac.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly accounts: UsersAccountsService,
    private readonly rbac: RbacService,
  ) {}

  // Phase 4b. Two kinds of caller reach these: admins (users:manage) and
  // supervisors (users:manage_staff). The door is any-of; what each may do to
  // WHICH person is decided in UsersAccountsService (user-access.ts), not here.
  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.create(dto, actor.id);
  }

  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Get()
  findAll(@Query() query: ListUsersQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.list(actor.id, query);
  }

  // Declared before ':id' so it is not read as a user id.
  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Get('options')
  options(@CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.options(actor.id);
  }

  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.detail(actor.id, id);
  }

  // The person's permissions, grouped by area in plain Arabic: those from
  // their job ticked and locked, the rest switchable only where this caller may.
  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Get(':id/permissions')
  permissions(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.permissionsOf(actor.id, id);
  }

  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Get(':id/activity')
  activity(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.activity(actor.id, id);
  }

  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.updateProfile(actor.id, id, dto);
  }

  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Put(':id/job')
  setJob(@Param('id') id: string, @Body() dto: SetJobDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.setJob(actor.id, id, dto);
  }

  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Put(':id/places')
  setPlaces(@Param('id') id: string, @Body() dto: SetPlacesDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.setPlaces(actor.id, id, dto);
  }

  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.deactivate(actor.id, id, dto.reason);
  }

  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Post(':id/reactivate')
  @HttpCode(200)
  reactivate(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.reactivate(actor.id, id, dto.reason);
  }

  // Phase 5A: "delete" means archive - history stays, the level above restores.
  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.archive(actor.id, id, dto.reason);
  }

  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.restore(actor.id, id, dto.reason);
  }

  // The response carries the one-time password: never cached anywhere.
  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Post(':id/reset-password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  resetPassword(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.resetPassword(actor.id, id);
  }

  @RequireAnyPermission('users:manage', 'users:manage_municipality_staff', 'users:manage_staff')
  @Post(':id/unlock')
  @HttpCode(200)
  unlock(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.unlock(actor.id, id);
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
  // Phase 5A: a municipality manager may adjust the permissions of the
  // supervisors and office managers of their own municipality, within the set
  // those jobs may hold (UsersAccountsService.grantDelegatedPermission);
  // everyone else needs roles:manage (the super admin).
  @RequireAnyPermission('roles:manage', 'users:manage_municipality_staff')
  @Post(':id/permissions')
  async grantPermission(
    @Param('id') id: string,
    @Body() dto: AssignPermissionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const held = await this.rbac.getPermissionsForUser(actor.id);
    if (held.has('roles:manage')) return this.users.grantPermission(id, dto.permissionId, actor.id);
    return this.accounts.grantDelegatedPermission(actor.id, id, dto.permissionId);
  }

  @RequireAnyPermission('roles:manage', 'users:manage_municipality_staff')
  @Delete(':id/permissions/:permissionId')
  async revokePermission(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const held = await this.rbac.getPermissionsForUser(actor.id);
    if (held.has('roles:manage')) return this.users.revokePermission(id, permissionId, actor.id);
    return this.accounts.revokeDelegatedPermission(actor.id, id, permissionId);
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

  // Registration pivot, phase 2: registration-station scope, mirroring
  // station-scope above.
  @RequirePermission('users:manage')
  @Post(':id/registration-station-scope')
  addRegistrationStationScope(
    @Param('id') id: string,
    @Body() dto: AssignRegistrationStationScopeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.addRegistrationStationScope(id, dto.registrationStationId, actor.id);
  }

  @RequirePermission('users:manage')
  @Delete(':id/registration-station-scope/:registrationStationId')
  removeRegistrationStationScope(
    @Param('id') id: string,
    @Param('registrationStationId') registrationStationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.removeRegistrationStationScope(id, registrationStationId, actor.id);
  }
}
