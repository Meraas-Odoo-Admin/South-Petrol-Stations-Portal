import { Module } from '@nestjs/common';
import { RegistrationReportsController } from './registration-reports.controller';
import { RegistrationReportsService } from './registration-reports.service';
import { ReportPdfModule } from '../report-pdf/report-pdf.module';

@Module({
  imports: [ReportPdfModule],
  controllers: [RegistrationReportsController],
  providers: [RegistrationReportsService],
  exports: [RegistrationReportsService],
})
export class RegistrationReportsModule {}
