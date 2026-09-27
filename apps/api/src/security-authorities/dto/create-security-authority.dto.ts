import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateSecurityAuthorityDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  // Every authority oversees exactly one municipality, and each
  // municipality has exactly one authority (OPEN_ITEMS.md #4, answered).
  @ApiProperty()
  @IsString()
  @MinLength(1)
  municipalityId!: string;
}
