import { ApiProperty } from '@nestjs/swagger';
import { RegistrationStationStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const REGISTRATION_STATION_SORTS = ['code', 'name', 'status', 'municipality'] as const;

// The registration-office list: search, filters and sorting - on the server.
export class ListRegistrationStationsQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  municipalityId?: string;

  @ApiProperty({ required: false, enum: RegistrationStationStatus })
  @IsOptional()
  @IsEnum(RegistrationStationStatus)
  status?: RegistrationStationStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  locality?: string;

  // Only honoured for a holder of registration_stations:manage.
  @ApiProperty({ required: false, enum: ['only', 'include'] })
  @IsOptional()
  @IsIn(['only', 'include'])
  archived?: 'only' | 'include';

  @ApiProperty({ required: false, enum: REGISTRATION_STATION_SORTS })
  @IsOptional()
  @IsIn(REGISTRATION_STATION_SORTS)
  sort?: (typeof REGISTRATION_STATION_SORTS)[number];

  @ApiProperty({ required: false, enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';
}
