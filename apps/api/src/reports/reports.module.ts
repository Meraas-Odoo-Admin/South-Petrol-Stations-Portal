import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsExportService } from './reports-export.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService],
})
export class ReportsModule {}
