import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class PrintCardDto {
  // 'full': colour + black (blank stock, today). 'black': the per-card
  // black layer only, for pre-printed colour stock later.
  @ApiProperty({ required: false, enum: ['full', 'black'], default: 'full' })
  @IsOptional()
  @IsIn(['full', 'black'])
  mode?: 'full' | 'black';
}
