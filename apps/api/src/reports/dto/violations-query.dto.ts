import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export type ViolationStatus = 'pending' | 'approved' | 'all';

export class ViolationsQueryDto extends PaginationQueryDto {
  // Required unless the caller holds reports:view_all_stations — enforced
  // in ReportsService, same rule as DailyReportQueryDto.
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
}
