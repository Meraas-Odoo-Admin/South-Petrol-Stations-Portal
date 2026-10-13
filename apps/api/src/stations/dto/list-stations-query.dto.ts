import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { StationStatus } from '@prisma/client';

export const STATION_SORTS = ['code', 'name', 'status', 'company', 'municipality'] as const;

// The petrol-station list: search, filters (municipality, company, status,
// type, locality, archived) and sorting - done on the server.
export class ListStationsQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  municipalityId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiProperty({ required: false, enum: StationStatus })
  @IsOptional()
  @IsEnum(StationStatus)
  status?: StationStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  locality?: string;

  // Only honoured for a holder of stations:create.
  @ApiProperty({ required: false, enum: ['only', 'include'] })
  @IsOptional()
  @IsIn(['only', 'include'])
  archived?: 'only' | 'include';

  @ApiProperty({ required: false, enum: STATION_SORTS })
  @IsOptional()
  @IsIn(STATION_SORTS)
  sort?: (typeof STATION_SORTS)[number];

  @ApiProperty({ required: false, enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';
}
