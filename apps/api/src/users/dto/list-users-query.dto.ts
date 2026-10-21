import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const USER_SIDE_FILTERS = ['PETROL_STATION', 'REGISTRATION', 'ADMIN'] as const;
export const USER_STATUS_FILTERS = ['active', 'deactivated', 'locked', 'must_change', 'archived'] as const;
// Sortable columns of the people list.
export const USER_SORTS = ['name', 'username', 'lastLogin', 'created'] as const;

export class ListUsersQueryDto extends PaginationQueryDto {
  // Name or username, anywhere in the text, any case.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  // ADMIN = jobs that sit on neither side (the administration jobs).
  @ApiProperty({ required: false, enum: USER_SIDE_FILTERS })
  @IsOptional()
  @IsIn(USER_SIDE_FILTERS)
  side?: (typeof USER_SIDE_FILTERS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roleId?: string;

  // A petrol station or a registration station, whichever the id belongs to.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  placeId?: string;

  // After review (21 Oct 2026): only the people who manage a place's staff
  // (the supervisors and office managers) — read from the permission their
  // job carries (users:manage_staff), never from a job's name.
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  supervisorsOnly?: boolean;

  // After review (21 Oct 2026): people working at a station or an office of
  // this municipality (the super admin's choice on «إدارة المحطات»).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  municipalityId?: string;

  @ApiProperty({ required: false, enum: USER_STATUS_FILTERS })
  @IsOptional()
  @IsIn(USER_STATUS_FILTERS)
  status?: (typeof USER_STATUS_FILTERS)[number];

  @ApiProperty({ required: false, enum: USER_SORTS })
  @IsOptional()
  @IsIn(USER_SORTS)
  sort?: (typeof USER_SORTS)[number];

  @ApiProperty({ required: false, enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';
}
