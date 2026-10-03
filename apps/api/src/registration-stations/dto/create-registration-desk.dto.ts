import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

// Registration pivot, phase 3: a desk and the card printer attached to it.
export class CreateRegistrationDeskDto {
  @ApiProperty({ description: 'e.g. "مكتب 1"' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  printerModel?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  printerSerial?: string;
}
