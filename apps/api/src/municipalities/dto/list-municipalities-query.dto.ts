import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const MUNICIPALITY_SORTS = ['name', 'status', 'stations', 'offices', 'created'] as const;

// The municipality list: search, status filter, archived filter and sorting.
export class ListMunicipalitiesQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiProperty({ required: false, enum: ['PREPARING', 'LIVE'] })
  @IsOptional()
  @IsIn(['PREPARING', 'LIVE'])
  status?: 'PREPARING' | 'LIVE';

  // Default: archived ones are left out. "only" lists just the archived;
  // "include" lists both.
  @ApiProperty({ required: false, enum: ['only', 'include'] })
  @IsOptional()
  @IsIn(['only', 'include'])
  archived?: 'only' | 'include';

  @ApiProperty({ required: false, enum: MUNICIPALITY_SORTS })
  @IsOptional()
  @IsIn(MUNICIPALITY_SORTS)
  sort?: (typeof MUNICIPALITY_SORTS)[number];

  @ApiProperty({ required: false, enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';
}
