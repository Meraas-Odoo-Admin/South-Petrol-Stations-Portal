import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { DailyReportQueryDto } from './daily-report-query.dto';

export class DailyReportExportQueryDto extends DailyReportQueryDto {
  @ApiProperty({ enum: ['xlsx', 'pdf'] })
  @IsIn(['xlsx', 'pdf'])
  format!: 'xlsx' | 'pdf';
}
