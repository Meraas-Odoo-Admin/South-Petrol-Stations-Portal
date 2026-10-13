import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../common/dto/page-query.dto';
import { DateRangeQueryDto } from '../../common/dto/date-range-query.dto';

// Filters shared by the role reports. Each report uses the ones that make
// sense for it and ignores the rest; every id is checked against the caller's
// scope in the service, never trusted.
export class OpsReportQueryDto extends DateRangeQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  municipalityId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  stationId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  officeId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn(['PETROL_95', 'DIESEL', 'KEROSENE'])
  fuelType?: 'PETROL_95' | 'DIESEL' | 'KEROSENE';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn(['CARD_SCAN', 'TYPED_REGISTERED', 'TYPED_UNREGISTERED', 'EMERGENCY_OVERRIDE'])
  identification?: 'CARD_SCAN' | 'TYPED_REGISTERED' | 'TYPED_UNREGISTERED' | 'EMERGENCY_OVERRIDE';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn(['FIRST_ISSUE', 'LOST', 'DAMAGED', 'FAILED_PRINT', 'DETAILS_CHANGED'])
  cardReason?: 'FIRST_ISSUE' | 'LOST' | 'DAMAGED' | 'FAILED_PRINT' | 'DETAILS_CHANGED';

  // Paging of the report's tables (UX round): on screen a table is read one page
  // at a time, sorted by the server. `table` names the one table to page
  // (and the only one returned); without it every table returns its first page.
  // The CSV export ignores all of this and writes every row.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  table?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sort?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';

  @ApiProperty({ required: false, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  take?: number;
}

export class OpsReportExportQueryDto extends OpsReportQueryDto {
  // Which table of the report to export (required here).
  @ApiProperty()
  @IsString()
  @MaxLength(60)
  declare table: string;
}
