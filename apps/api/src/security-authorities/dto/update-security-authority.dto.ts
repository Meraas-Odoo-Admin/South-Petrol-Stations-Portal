import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateSecurityAuthorityDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  // Correcting which municipality an authority belongs to — still one per
  // municipality (enforced by the unique index and checked below).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  municipalityId?: string;
}
