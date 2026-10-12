import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

// One employee's activity timeline: a date range plus paging.
export class ActivityQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be a calendar day, YYYY-MM-DD.' })
  from?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be a calendar day, YYYY-MM-DD.' })
  to?: string;

  @ApiProperty({ required: false, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiProperty({ required: false, minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 50;
}
