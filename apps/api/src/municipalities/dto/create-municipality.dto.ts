import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateMunicipalityDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  // The card-number prefix (SBH for سبها): 2-5 uppercase Latin letters.
  // Required (after review, 19 Oct 2026): every municipality can issue cards
  // from the day it is created.
  @ApiProperty({ example: 'SBH' })
  @IsString()
  @Matches(/^[A-Z]{2,5}$/, { message: 'الرمز يتكوّن من 2 إلى 5 أحرف إنجليزية كبيرة.' })
  code!: string;
}
