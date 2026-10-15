import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

// WHERE a print happens: the registration office of the employee who prints.
// Optional - left out, the card's own office is used. A reprint from another
// office than the one that issued the card names its own. Phase 7: no desk.
export class PrintLocationDto {
  @ApiProperty({ required: false, description: 'The registration station the print is made at.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  registrationStationId?: string;
}

export class PrintCardDto extends PrintLocationDto {
  // 'full': colour + black (blank stock, today). 'black': the per-card
  // black layer only, for pre-printed colour stock later.
  @ApiProperty({ required: false, enum: ['full', 'black'], default: 'full' })
  @IsOptional()
  @IsIn(['full', 'black'])
  mode?: 'full' | 'black';
}
