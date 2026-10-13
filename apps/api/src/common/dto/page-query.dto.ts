import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// UX round: every screen that lists rows asks for ONE page and is told the
// total, so no list is unbounded. 25 rows by default, at most 100.
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export class PageQueryDto {
  @ApiProperty({ required: false, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  take?: number;
}

export interface Paged<T> {
  total: number;
  skip: number;
  take: number;
  items: T[];
}

export function pageOf(query: { skip?: number; take?: number }): { skip: number; take: number } {
  return { skip: query.skip ?? 0, take: query.take ?? DEFAULT_PAGE_SIZE };
}

// The hard ceiling for the PICKER lists (a dropdown that has to show every
// choice): one request never returns more than this many rows.
export const PICKER_LIMIT = 200;
