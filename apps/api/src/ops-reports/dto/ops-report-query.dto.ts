import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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
}

export class OpsReportExportQueryDto extends OpsReportQueryDto {
  // Which table of the report to export.
  @ApiProperty()
  @IsString()
  @MaxLength(60)
  table!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sort?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';
}
