import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const USER_SIDE_FILTERS = ['PETROL_STATION', 'REGISTRATION', 'ADMIN'] as const;
export const USER_STATUS_FILTERS = ['active', 'deactivated', 'locked', 'must_change'] as const;

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

  @ApiProperty({ required: false, enum: USER_STATUS_FILTERS })
  @IsOptional()
  @IsIn(USER_STATUS_FILTERS)
  status?: (typeof USER_STATUS_FILTERS)[number];
}
