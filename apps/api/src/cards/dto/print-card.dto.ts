import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

// WHERE a print happens: the registration office and desk of the employee who
// prints. Optional - left out, the card's own office and desk are used. A
// reprint from another office than the one that issued the card names its own.
export class PrintLocationDto {
  @ApiProperty({ required: false, description: 'The registration station the print is made at.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  registrationStationId?: string;

  @ApiProperty({ required: false, description: 'The desk (and printer) the print is made at.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  deskId?: string;
}

export class PrintCardDto extends PrintLocationDto {
  // 'full': colour + black (blank stock, today). 'black': the per-card
  // black layer only, for pre-printed colour stock later.
  @ApiProperty({ required: false, enum: ['full', 'black'], default: 'full' })
  @IsOptional()
  @IsIn(['full', 'black'])
  mode?: 'full' | 'black';
}
