import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelCardDto {
  @ApiProperty({ description: 'Why the card is cancelled without a replacement.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
