import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OwnersService } from './owners.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { UpdateOwnerIdentityDto } from './dto/update-owner-identity.dto';
import { FindOwnersQueryDto } from './dto/find-owners-query.dto';
import { CreateOwnerChangeRequestDto } from './dto/create-owner-change-request.dto';
import { RejectOwnerChangeRequestDto } from './dto/reject-owner-change-request.dto';
import { FindOwnerChangeRequestsQueryDto } from './dto/find-owner-change-requests-query.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('owners')
@Controller('owners')
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  @RequirePermission('owners:manage')
  @Post()
  create(@Body() dto: CreateOwnerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.owners.create(dto, actor.id);
  }

  // Registration pivot, phase 2: read-only lookup split out of
  // owners:manage, which petrol-station roles no longer hold — the daily
  // report's owner filter (station supervisors) still needs to search.
  @RequirePermission('owners:read')
  @Get()
  findAll(@Query() query: FindOwnersQueryDto) {
    return this.owners.findAll(query);
  }

  // Registered BEFORE @Get(':id') — a static path segment must win over
  // the dynamic :id route it would otherwise collide with (same ordering
  // discipline as VehiclesController.listChangeRequests).
  @RequirePermission('owners:approve_change')
  @Get('change-requests')
  listChangeRequests(@Query() query: FindOwnerChangeRequestsQueryDto) {
    return this.owners.listChangeRequests(query);
  }

  @RequirePermission('owners:read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.owners.findOne(id);
  }

  @RequirePermission('owners:reveal_identity')
  @Post(':id/reveal-identity')
  revealIdentity(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.owners.revealIdentity(id, actor.id);
  }

  // After review (18 Oct 2026): the identity, directly, for whoever may
  // approve such corrections (office manager and above).
  @RequirePermission('owners:approve_change')
  @Patch(':id/identity')
  updateIdentity(@Param('id') id: string, @Body() dto: UpdateOwnerIdentityDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.owners.updateIdentity(id, dto, actor.id);
  }

  @RequirePermission('owners:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOwnerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.owners.update(id, dto, actor.id);
  }

  // Always creates a PENDING request — see OwnersService.requestIdentityChange
  // for why there's no "first-time set" bypass, unlike vehicles.
  @RequirePermission('owners:request_change')
  @Post(':id/change-requests')
  requestChange(
    @Param('id') id: string,
    @Body() dto: CreateOwnerChangeRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.owners.requestIdentityChange(id, dto, actor.id);
  }

  @RequirePermission('owners:approve_change')
  @Post('change-requests/:id/approve')
  approveChangeRequest(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.owners.approveChangeRequest(id, actor.id);
  }

  @RequirePermission('owners:approve_change')
  @Post('change-requests/:id/reject')
  rejectChangeRequest(
    @Param('id') id: string,
    @Body() dto: RejectOwnerChangeRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.owners.rejectChangeRequest(id, dto, actor.id);
  }
}
