import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { CardStockService } from './card-stock.service';
import { CreateStockEntryDto } from './dto/create-stock-entry.dto';
import { CorrectStockEntryDto } from './dto/correct-stock-entry.dto';
import { StockQueryDto } from './dto/stock-query.dto';
import { StockExportQueryDto } from './dto/stock-export-query.dto';
import { reconciliationPdf } from './reconciliation-pdf';
import { ReportPdfService } from '../report-pdf/report-pdf.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

// Blank-card stock (phase 4c). There is deliberately no PATCH and no DELETE:
// entries are insert-only, and a mistake is a new correction entry.
@ApiTags('card-stock')
@Controller('card-stock')
export class CardStockController {
  constructor(
    private readonly stock: CardStockService,
    private readonly pdf: ReportPdfService,
  ) {}

  @RequirePermission('card_stock:record')
  @Post('entries')
  create(@Body() dto: CreateStockEntryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stock.createEntry(dto, actor.id);
  }

  @RequirePermission('card_stock:record')
  @Post('entries/:id/corrections')
  correct(@Param('id') id: string, @Body() dto: CorrectStockEntryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stock.correct(id, dto, actor.id);
  }

  @RequirePermission('card_stock:read')
  @Get('entries')
  list(@Query() query: StockQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stock.listEntries(query, actor.id);
  }

  @RequirePermission('card_stock:read')
  @Get('reconciliation/export')
  async exportReconciliation(
    @Query() query: StockExportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.pdf.render(reconciliationPdf(await this.stock.reconciliation(query, actor.id)));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="card-stock-reconciliation.pdf"' });
    return new StreamableFile(pdf);
  }

  @RequirePermission('card_stock:read')
  @Get('reconciliation')
  reconciliation(@Query() query: StockQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.stock.reconciliation(query, actor.id);
  }
}
