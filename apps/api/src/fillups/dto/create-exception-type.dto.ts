import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateExceptionTypeDto {
  @ApiProperty({ description: 'Stable machine key, e.g. "medical_chronic" — never shown to end users.' })
  @IsString()
  @MinLength(1)
  key!: string;

  @ApiProperty({ description: 'Arabic display name shown in the exception-type dropdown.' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  requiresProof?: boolean;
}
