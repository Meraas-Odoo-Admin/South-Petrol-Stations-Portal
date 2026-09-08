import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { IdentityType } from '@prisma/client';
import { IsValidIdentityNumber } from '../../common/validators/identity-number.validator';

// Mirrors CreateVehicleChangeRequestDto, but for an owner's identityType/
// identityNumber pair specifically — IsValidIdentityNumber reads a sibling
// `identityType` property off this same object, which is why the field is
// named plainly `identityType` here rather than `requestedIdentityType`.
export class CreateOwnerChangeRequestDto {
  @ApiProperty({ enum: IdentityType })
  @IsEnum(IdentityType)
  identityType!: IdentityType;

  @ApiProperty({ description: 'The corrected identity number, in the format matching identityType.' })
  @IsString()
  @IsValidIdentityNumber()
  identityNumber!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason!: string;

  @ApiProperty({ description: 'Mandatory, same as a vehicle change request.' })
  @IsString()
  @MinLength(1)
  proofReference!: string;
}
