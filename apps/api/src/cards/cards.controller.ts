import { Body, Controller, Get, HttpCode, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CardsService } from './cards.service';
import { IssueCardDto } from './dto/issue-card.dto';
import { PrintCardDto, PrintLocationDto } from './dto/print-card.dto';
import { CancelCardDto } from './dto/cancel-card.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

// Registration pivot, phase 3 — the printed vehicle card. Issuing and
// printing are registration-desk actions (cards:issue, never held by a
// petrol-station role); the pump side only scans (cards:scan).
@ApiTags('cards')
@Controller()
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @RequirePermission('cards:read')
  @Get('vehicles/:vehicleId/cards')
  listForVehicle(@Param('vehicleId') vehicleId: string) {
    return this.cards.listForVehicle(vehicleId);
  }

  @RequirePermission('cards:issue')
  @Post('vehicles/:vehicleId/cards')
  issue(@Param('vehicleId') vehicleId: string, @Body() dto: IssueCardDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.cards.issue(vehicleId, dto, actor.id);
  }

  // Static paths before ':id' ones.
  // The one-page setup card for the real printer: printed once, never counted.
  @RequirePermission('cards:issue')
  @Get('cards/printer-setup')
  async printerSetup(@Res({ passthrough: true }) res: Response) {
    const pdf = await this.cards.printerSetupCard();
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="printer-setup-card.pdf"' });
    return new StreamableFile(pdf);
  }

  // Not audited — scanning isn't a change.
  @RequirePermission('cards:scan')
  @Get('cards/scan/:cardNumber')
  scan(@Param('cardNumber') cardNumber: string) {
    return this.cards.scan(cardNumber);
  }

  @RequirePermission('cards:read')
  @Get('cards/:id/preview')
  async preview(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const png = await this.cards.preview(id);
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300' });
    return new StreamableFile(png);
  }

  // POST, not GET: every print (and reprint) writes an audit-log row.
  @RequirePermission('cards:issue')
  @Post('cards/:id/print')
  @HttpCode(200)
  async print(
    @Param('id') id: string,
    @Body() dto: PrintCardDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { pdf, cardNumber } = await this.cards.print(
      id,
      dto.mode ?? 'full',
      { registrationStationId: dto.registrationStationId, deskId: dto.deskId },
      actor.id,
    );
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="card-${cardNumber}.pdf"` });
    return new StreamableFile(pdf);
  }

  @RequirePermission('cards:issue')
  @Post('cards/:id/failed-print')
  failedPrint(@Param('id') id: string, @Body() dto: PrintLocationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.cards.failedPrint(id, dto, actor.id);
  }

  @RequirePermission('cards:cancel')
  @Post('cards/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() dto: CancelCardDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.cards.cancel(id, dto.reason, actor.id);
  }
}
