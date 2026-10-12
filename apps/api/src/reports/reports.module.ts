import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsExportService } from './reports-export.service';
import { ReportPdfModule } from '../report-pdf/report-pdf.module';

@Module({
  imports: [ReportPdfModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService],
})
export class ReportsModule {}
