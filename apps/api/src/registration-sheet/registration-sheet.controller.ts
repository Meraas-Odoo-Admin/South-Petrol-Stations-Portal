import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RegistrationSheetService } from './registration-sheet.service';
import { SheetQueryDto } from './dto/sheet-query.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('registration-sheet')
@Controller('registration-sheet')
export class RegistrationSheetController {
  constructor(private readonly sheet: RegistrationSheetService) {}

  @RequirePermission('registration_sheet:print')
  @Get()
  async pdf(
    @Query() query: SheetQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.sheet.renderPdf(query, actor.id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="registration-stations.pdf"' });
    return new StreamableFile(pdf);
  }
}
