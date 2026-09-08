import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { FindVehiclesQueryDto } from './dto/find-vehicles-query.dto';
import { PlateChangeDto } from './dto/plate-change.dto';
import { CreateVehicleChangeRequestDto } from './dto/create-change-request.dto';
import { RejectVehicleChangeRequestDto } from './dto/reject-change-request.dto';
import { FindChangeRequestsQueryDto } from './dto/find-change-requests-query.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('vehicles')
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

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
