import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// A lookup list (companies, routes, types, authorities) is capped at 200 rows.
// When the cap is reached the screen asks the person to type, and this is the
// search: the name contains `q`.
export class LookupQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
