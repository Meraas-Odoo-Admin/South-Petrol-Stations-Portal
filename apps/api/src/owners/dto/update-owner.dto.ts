import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { cleanDigits } from '@fuel-tracking/shared-types';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  IsArabicPersonName,
  IsNationalIdNumber,
  IsOptionalLibyanMobile,
} from '../../common/validators/shared-field-checks';
import { normalizePhoneValue } from '../../common/validators/phone-transform';

// identityType/identityNumber are deliberately absent — immutable after
// creation, same as Driver.identityType/identityNumber and User.username.
// Recording a fill-up under the wrong owner identity is a data-integrity
// issue, not something a PATCH should paper over.
//
// Phase 5A: the name is length-checked here and OwnersService applies the rule
// of the owner's kind (Arabic letters for a person; for an institution its
// name rules and duplicate key), the phone is a Libyan mobile number, and an
// institution's responsible driver can be corrected here (their national ID
// goes through every national-ID rule, 18+ included).
export class UpdateOwnerDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  fullName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(normalizePhoneValue)
  @IsString()
  @IsOptionalLibyanMobile()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? cleanDigits(value) : value))
  @IsString()
  @IsNationalIdNumber()
  responsibleDriverNationalId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsArabicPersonName('اسم السائق المسؤول')
  responsibleDriverName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(normalizePhoneValue)
  @IsString()
  @IsOptionalLibyanMobile()
  responsibleDriverPhone?: string;
}
