import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

// An inclusive range of Africa/Tripoli calendar days, YYYY-MM-DD. Both ends
// optional: the report picks its own default window.
export class DateRangeQueryDto {
  @ApiProperty({ required: false, example: '2026-10-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be a calendar day, YYYY-MM-DD.' })
  from?: string;

  @ApiProperty({ required: false, example: '2026-10-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be a calendar day, YYYY-MM-DD.' })
  to?: string;
}
