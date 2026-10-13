import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../common/dto/page-query.dto';

export const PLACE_SORTS = ['name', 'code', 'type', 'status', 'company', 'locality'] as const;
export const PERSON_SORTS = ['name', 'username', 'job', 'lastLogin'] as const;

// «المحطات والمكاتب»: stations and registration offices of one municipality in
// one list. Search, filters and sort run on the server.
export class MunicipalityPlacesQueryDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: ['STATION', 'OFFICE'], description: 'Omitted: both.' })
  @IsOptional()
  @IsIn(['STATION', 'OFFICE'])
  kind?: 'STATION' | 'OFFICE';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  // A station status, an office status, or ARCHIVED.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED_LEGAL', 'SUSPENDED_COMMITTEE', 'SUSPENDED_OWNER', 'NOT_YET_SUPPLIED', 'UNVERIFIED', 'TEMPORARILY_CLOSED', 'CLOSED', 'ARCHIVED'])
  status?: string;

  @ApiProperty({ required: false, description: 'Stations only: an office has no company.' })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  locality?: string;

  @ApiProperty({ required: false, enum: PLACE_SORTS })
  @IsOptional()
  @IsIn(PLACE_SORTS)
  sort?: (typeof PLACE_SORTS)[number];

  @ApiProperty({ required: false, enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';
}

// «الأشخاص»: the people of one municipality, by job, with search and status.
export class MunicipalityPeopleQueryDto extends PageQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiProperty({ required: false, enum: ['active', 'deactivated', 'locked'] })
  @IsOptional()
  @IsIn(['active', 'deactivated', 'locked'])
  status?: 'active' | 'deactivated' | 'locked';

  @ApiProperty({ required: false, enum: PERSON_SORTS })
  @IsOptional()
  @IsIn(PERSON_SORTS)
  sort?: (typeof PERSON_SORTS)[number];

  @ApiProperty({ required: false, enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';
}
