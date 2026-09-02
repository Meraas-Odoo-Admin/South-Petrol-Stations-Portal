import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
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
}
