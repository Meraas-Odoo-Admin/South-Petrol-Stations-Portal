import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import type { ViolationStatus } from './violations-query.dto';

// Deliberately NOT PaginationQueryDto: an export is "give me the whole
// filtered set as a document," not one page of it. Row count is capped in
// ReportsExportService (EXPORT_ROW_LIMIT) as a safety net instead.
export class ViolationsExportQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  stationId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiProperty({ required: false, enum: ['pending', 'approved', 'all'], default: 'all' })
  @IsOptional()
  @IsIn(['pending', 'approved', 'all'])
  status?: ViolationStatus = 'all';

  @ApiProperty({ enum: ['xlsx', 'pdf'] })
  @IsIn(['xlsx', 'pdf'])
  format!: 'xlsx' | 'pdf';
}
