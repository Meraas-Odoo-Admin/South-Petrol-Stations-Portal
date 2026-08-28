import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { NATIONAL_OR_ADMINISTRATIVE_ID_REGEX } from '../../common/validators/libyan-formats';

export class CreateOwnerDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiProperty({ required: false, description: '12 digits: national ID (1/2 prefix) or administrative ID (9 prefix).' })
  @IsOptional()
  @IsString()
  @Matches(NATIONAL_OR_ADMINISTRATIVE_ID_REGEX, {
    message: 'nationalId must be 12 digits starting with 1, 2 (national ID) or 9 (administrative ID).',
  })
  nationalId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;
}
