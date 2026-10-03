import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { IdentityType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Round 7 item 3: the daily report's owner-search filter needs to look an
// owner up by identity number (same "search by ID, not name" precedent as
// the old driver field) or by name, for visual confirmation before
// selecting — same reasoning as every other search-select in this app.
export class FindOwnersQueryDto extends PaginationQueryDto {
  @ApiProperty({ required: false, description: 'Matches fullName (contains) or identityNumber (contains).' })
  @IsOptional()
  @IsString()
  search?: string;

  // Registration pivot, phase 2: the registration screen finds the owner
  // FIRST, by exact identity type + number (the pair is unique), before
  // offering to create a new one. Both must be given together.
  @ApiProperty({ required: false, enum: IdentityType })
  @IsOptional()
  @IsEnum(IdentityType)
  identityType?: IdentityType;

  @ApiProperty({ required: false, description: 'Exact match, together with identityType.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  identityNumber?: string;
}
