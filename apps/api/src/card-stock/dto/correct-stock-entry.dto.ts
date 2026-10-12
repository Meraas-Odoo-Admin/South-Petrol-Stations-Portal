import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CorrectStockEntryDto {
  // The right quantity, replacing the earlier entry's.
  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity!: number;

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
