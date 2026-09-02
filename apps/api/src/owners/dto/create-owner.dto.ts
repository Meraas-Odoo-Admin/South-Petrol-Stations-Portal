import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { IdentityType } from '@prisma/client';
import { IsValidIdentityNumber } from '../../common/validators/identity-number.validator';

// Same (identityType, identityNumber) shape as CreateDriverDto — round 6:
// the vehicle owner, not the driver, is the identity that matters for
// fill-up rules (see docs/DESIGN_owner_based_fillups.md).
export class CreateOwnerDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;
}
