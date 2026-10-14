import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { FillUpsService } from './fillups.service';
import { CreateFillUpDto } from './dto/create-fillup.dto';
import { CreateExceptionTypeDto } from './dto/create-exception-type.dto';
import { UpdateExceptionTypeDto } from './dto/update-exception-type.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('fillups')
@Controller('fillups')
export class FillUpsController {
  constructor(private readonly fillups: FillUpsService) {}

  // Status code is decided by outcome, not fixed by decorator: 201 for a
  // newly created transaction, 200 for an idempotent replay of an existing
  // one, 422 for a rule-engine rejection — hence @Res({ passthrough: true })
  // rather than @HttpCode(), which can only ever be static.
  @RequirePermission('fillups:create')
  @Post()
  async create(
    @Body() dto: CreateFillUpDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }

    const result = await this.fillups.create(dto, idempotencyKey, actor.id);

    if (result.status === 'rejected') {
      res.status(422);
      return { allowed: false, reason: result.reason, trigger: result.trigger, requiresException: true };
    }

    if (result.status === 'existing') {
      res.status(200);
    }
    return result.transaction;
  }

  @RequirePermission('fillups:approve_exception')
  @Post(':id/exceptions/approve')
  approveException(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.fillups.approveException(id, actor.id);
  }

  // Registered BEFORE @Get(':id')-shaped routes would go, if this
  // controller ever grows one — static path segments must win over a
  // dynamic :id at the same depth.
  @RequirePermission('exception_types:manage')
  @Get('exception-types/all')
  listAllExceptionTypes() {
    return this.fillups.listAllExceptionTypes();
  }

  @RequirePermission('exception_types:manage')
  @Post('exception-types')
  createExceptionType(@Body() dto: CreateExceptionTypeDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.fillups.createExceptionType(dto, actor.id);
  }

  @RequirePermission('exception_types:manage')
  @Patch('exception-types/:id')
  updateExceptionType(
    @Param('id') id: string,
    @Body() dto: UpdateExceptionTypeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.fillups.updateExceptionType(id, dto, actor.id);
  }

  // Gated on fillups:create (not a separate permission) — anyone who can
  // submit a fill-up needs this to know the exception categories and
  // whether each requires proof, same as approving needs its own gate.
  // Only ACTIVE types — the admin-only "see everything, including
  // deactivated" view is listAllExceptionTypes above.
  @RequirePermission('fillups:create')
  @Get('exception-types')
  listExceptionTypes() {
    return this.fillups.listActiveExceptionTypes();
  }

  @RequirePermission('fillups:create')
  @Get('fuel-prices')
  getFuelPrices() {
    return this.fillups.getFuelPrices();
  }

  // Round 7 item 1: pre-submit rule-review breakdown — see
  // FillUpsService.previewRules for why this is gated the same as
  // getFuelPrices/listExceptionTypes rather than vehicles:read.
  @RequirePermission('fillups:create')
  @Get('rule-preview')
  previewRules(
    @Query('stationId') stationId: string,
    @Query('vehicleId') vehicleId: string | undefined,
    @Query('cardNumber') cardNumber: string | undefined,
    @Query('plate') plate: string | undefined,
    @Query('emergencyOverride') emergencyOverride: string | undefined,
    @Query('fuelType') fuelType: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!vehicleId && !cardNumber && !plate) {
      throw new BadRequestException('vehicleId, cardNumber or plate is required.');
    }
    // Allowances are counted per municipality, and the station decides
    // which one — without it the preview can't match a real submit.
    if (!stationId) {
      throw new BadRequestException('stationId is required.');
    }
    return this.fillups.previewRules(
      {
        vehicleId: vehicleId || undefined,
        cardNumber: cardNumber || undefined,
        plate: plate || undefined,
        emergencyOverride: emergencyOverride === 'true',
        fuelType:
          fuelType === 'PETROL_95' || fuelType === 'DIESEL' || fuelType === 'KEROSENE' ? fuelType : undefined,
      },
      stationId,
      actor.id,
    );
  }
}
