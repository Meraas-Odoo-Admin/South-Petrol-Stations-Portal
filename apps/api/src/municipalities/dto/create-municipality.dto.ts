import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateMunicipalityDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  // Optional card-number prefix (SBH for سبها): 2-5 uppercase Latin letters.
  // A card can't be issued in a municipality until it has one.
  @ApiProperty({ required: false, example: 'SBH' })
  @IsOptional()
  @Matches(/^[A-Z]{2,5}$/, { message: 'الرمز يتكوّن من 2 إلى 5 أحرف إنجليزية كبيرة.' })
  code?: string;
}
