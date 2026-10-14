import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsOptionalLibyanMobile } from '../../common/validators/shared-field-checks';
import { normalizePhoneValue } from '../../common/validators/phone-transform';

// identityType/identityNumber are deliberately absent — immutable after
// creation, same as Driver.identityType/identityNumber and User.username.
// Recording a fill-up under the wrong owner identity is a data-integrity
// issue, not something a PATCH should paper over.
//
// The name is length-checked here and OwnersService applies the Arabic person
// name rule; the phone is a Libyan mobile number.
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
}
