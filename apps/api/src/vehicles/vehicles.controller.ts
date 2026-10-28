import { Body, Controller, Get, Param, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { UpdateVehicleIdentityDto } from './dto/update-vehicle-identity.dto';
import { FindVehiclesQueryDto } from './dto/find-vehicles-query.dto';
import { PlateChangeDto } from './dto/plate-change.dto';
import { CreateVehicleChangeRequestDto } from './dto/create-change-request.dto';
import { RejectVehicleChangeRequestDto } from './dto/reject-change-request.dto';
import { FindChangeRequestsQueryDto } from './dto/find-change-requests-query.dto';
import { DuplicateCheckQueryDto } from './dto/duplicate-check-query.dto';
import { TransferOwnerDto } from './dto/transfer-owner.dto';
import { DetachOwnerDto } from './dto/detach-owner.dto';
import { AuditedExport } from '../audit/audited-export';
import { RbacService } from '../rbac/rbac.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('vehicles')
@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly rbac: RbacService,
  ) {}

  @RequirePermission('vehicles:manage')
  @Post()
  create(@Body() dto: CreateVehicleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.vehicles.create(dto, actor.id);
  }

  @RequirePermission('vehicles:read')
  @Get()
  findAll(@Query() query: FindVehiclesQueryDto) {
    return this.vehicles.findAll(query);
  }

  // After review (28 Oct 2026): «سحب كشف» — the list's own filters as a CSV
  // file. For the office managers and those above them (their reports
  // permission); recorded in the audit log.
  @RequirePermission('registration_reports:view')
  @AuditedExport('vehicles')
  @Get('export')
  async exportCsv(
    @Query() query: FindVehiclesQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const reveal = (await this.rbac.getPermissionsForUser(actor.id)).has('owners:reveal_identity');
    const { csv, truncated } = await this.vehicles.exportCsv(query, reveal);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli' }).format(new Date());
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vehicles-${day}.csv"`,
      'X-Truncated': String(truncated),
      'Access-Control-Expose-Headers': 'X-Truncated',
    });
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }

  // Registration screen's pre-save duplicate check — gated like
  // registering itself. Registered before @Get(':id'), same as below.
  @RequirePermission('vehicles:manage')
  @Get('duplicate-check')
  duplicateCheck(@Query() query: DuplicateCheckQueryDto) {
    return this.vehicles.findDuplicates(query);
  }

  // Registered BEFORE @Get(':id') — a static path segment must win over the
  // dynamic :id route it would otherwise collide with.
  @RequirePermission('vehicles:approve_change')
  @Get('change-requests')
  listChangeRequests(@Query() query: FindChangeRequestsQueryDto) {
    return this.vehicles.listChangeRequests(query);
  }

  @RequirePermission('vehicles:read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehicles.findOneDetailed(id);
  }

  @RequirePermission('vehicles:read')
  @Get(':id/weekly-usage')
  getWeeklyUsage(@Param('id') id: string) {
    return this.vehicles.getWeeklyUsage(id);
  }

  // After review (18 Oct 2026): the identity fields, directly, for whoever
  // may approve such changes (office manager and above).
  @RequirePermission('vehicles:approve_change')
  @Patch(':id/identity')
  updateIdentity(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleIdentityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vehicles.updateIdentity(id, dto, actor.id);
  }

  @RequirePermission('vehicles:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vehicles.update(id, dto, actor.id);
  }

  // Round 14: this used to be gated on vehicles:manage — fine while only
  // supervisor-tier roles held that permission, but station_employee was
  // granted vehicles:manage in round 13 (so employees can create vehicle
  // profiles), which would have let an ordinary employee change a plate
  // directly with zero approval — exactly what the client now wants
  // gated. Restricted to vehicles:approve_change (supervisor/directorate-
  // admin/system-admin) for a genuinely-urgent direct correction; an
  // employee goes through POST /vehicles/:id/change-requests
  // (PLATE_CHANGE) instead, gated on vehicles:request_change.
  // After review (28 Oct 2026): «نقل الملكية» — the office manager's.
  @RequirePermission('vehicles:transfer_owner')
  @Post(':id/transfer-owner')
  transferOwner(@Param('id') id: string, @Body() dto: TransferOwnerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.vehicles.transferOwner(id, dto, actor.id);
  }

  // After review (28 Oct 2026): «فك المركبة من المالك» — same holders as «نقل الملكية».
  @RequirePermission('vehicles:transfer_owner')
  @Post(':id/detach-owner')
  detachOwner(@Param('id') id: string, @Body() dto: DetachOwnerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.vehicles.detachOwner(id, dto.reason, actor.id);
  }

  @RequirePermission('vehicles:approve_change')
  @Post(':id/plate-change')
  changePlate(
    @Param('id') id: string,
    @Body() dto: PlateChangeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vehicles.changePlate(id, dto, actor.id);
  }

  // Sets the value directly (no approval) if there's no existing value to
  // displace, or creates a pending VehicleChangeRequest if there is — see
  // VehiclesService.setOrRequestChange for the "was there already a
  // non-null value" rule this branches on.
  @RequirePermission('vehicles:request_change')
  @Post(':id/change-requests')
  requestChange(
    @Param('id') id: string,
    @Body() dto: CreateVehicleChangeRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vehicles.setOrRequestChange(id, dto, actor.id);
  }

  @RequirePermission('vehicles:approve_change')
  @Post('change-requests/:id/approve')
  approveChangeRequest(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.vehicles.approveChangeRequest(id, actor.id);
  }

  @RequirePermission('vehicles:approve_change')
  @Post('change-requests/:id/reject')
  rejectChangeRequest(
    @Param('id') id: string,
    @Body() dto: RejectVehicleChangeRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vehicles.rejectChangeRequest(id, dto, actor.id);
  }
}
