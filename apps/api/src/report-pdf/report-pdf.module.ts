import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { ReportPdfService } from './report-pdf.service';

@Module({
  imports: [CardsModule],
  providers: [ReportPdfService],
  exports: [ReportPdfService],
})
export class ReportPdfModule {}
