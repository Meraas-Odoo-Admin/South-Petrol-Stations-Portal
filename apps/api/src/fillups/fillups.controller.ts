import { BadRequestException, Body, Controller, Headers, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { FillUpsService } from './fillups.service';
import { CreateFillUpDto } from './dto/create-fillup.dto';
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
      return { allowed: false, reason: result.reason, requiresException: true };
    }

    if (result.status === 'existing') {
      res.status(200);
      return result.transaction;
    }

    return result.transaction;
  }

  @RequirePermission('fillups:approve_exception')
  @Post(':id/exceptions/approve')
  approveException(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.fillups.approveException(id, actor.id);
  }
}
