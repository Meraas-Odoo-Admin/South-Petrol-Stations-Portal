import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

// A delivery of blank cards, or a physical count of the blanks remaining.
// (A correction has its own endpoint: entries are never edited.)
export class CreateStockEntryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  registrationStationId!: string;

  // Leave out for the whole office.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deskId?: string;

  @ApiProperty({ enum: ['RECEIVED', 'COUNT'] })
  @IsIn(['RECEIVED', 'COUNT'])
  kind!: 'RECEIVED' | 'COUNT';

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity!: number;

  // When the delivery arrived or the count was made. Defaults to now; never in the future.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
