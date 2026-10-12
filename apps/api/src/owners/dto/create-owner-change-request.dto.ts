import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { cleanDigits } from '@fuel-tracking/shared-types';
import { IsValidIdentityNumber } from '../../common/validators/identity-number.validator';

// Mirrors CreateVehicleChangeRequestDto, but for an owner's identityType/
// identityNumber pair specifically — IsValidIdentityNumber reads a sibling
// `identityType` property off this same object, which is why the field is
// named plainly `identityType` here rather than `requestedIdentityType`.
export class CreateOwnerChangeRequestDto {
  @ApiProperty({ enum: ['NATIONAL_ID', 'ADMINISTRATIVE_ID'] })
  @IsIn(['NATIONAL_ID', 'ADMINISTRATIVE_ID'], { message: 'نوع الهوية يجب أن يكون الرقم الوطني أو الرقم الإداري.' })
  identityType!: 'NATIONAL_ID' | 'ADMINISTRATIVE_ID';

  @ApiProperty({ description: 'The corrected identity number, in the format matching identityType.' })
  @Transform(({ value }) => (typeof value === 'string' ? cleanDigits(value) : value))
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
