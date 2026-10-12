import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptionalLibyanMobile } from '../../common/validators/shared-field-checks';
import { normalizePhoneValue } from '../../common/validators/phone-transform';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// The username never changes after creation (it is the login and the audit
// trail's reference), so it is not accepted here.
export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  // An empty string clears the phone.
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(normalizePhoneValue)
  @IsString()
  @IsOptionalLibyanMobile()
  @MaxLength(30)
  phone?: string;
}
