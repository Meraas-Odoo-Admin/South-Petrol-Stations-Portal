import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

// Default range when from/to are omitted: the 30 days ending now. Not
// specified in the plan — a reasonable default for a "directorate-wide
// dashboard" landing view, not a client-confirmed number.
export const DEFAULT_DASHBOARD_RANGE_DAYS = 30;

export class DashboardQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
