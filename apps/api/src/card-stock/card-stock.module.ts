import { Module } from '@nestjs/common';
import { CardStockController } from './card-stock.controller';
import { CardStockService } from './card-stock.service';
import { ReportPdfModule } from '../report-pdf/report-pdf.module';

@Module({
  imports: [ReportPdfModule],
  controllers: [CardStockController],
  providers: [CardStockService],
  exports: [CardStockService],
})
export class CardStockModule {}
