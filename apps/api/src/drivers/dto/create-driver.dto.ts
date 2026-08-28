import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { IdentityType } from '@prisma/client';
import { IsValidIdentityNumber } from '../../common/validators/identity-number.validator';

export class CreateDriverDto {
  @ApiProperty({ enum: IdentityType })
  @IsEnum(IdentityType)
  identityType!: IdentityType;

  @ApiProperty({
    description:
      '12 digits: 1YYYYXXXXXXX / 2YYYYXXXXXXX for a national ID, 9YYYYXXXXXXX for an administrative ID.',
  })
  @IsString()
  @IsValidIdentityNumber()
  identityNumber!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}
