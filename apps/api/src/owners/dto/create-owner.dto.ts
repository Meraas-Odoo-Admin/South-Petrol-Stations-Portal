import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { cleanDigits } from '@fuel-tracking/shared-types';
import { IsValidIdentityNumber } from '../../common/validators/identity-number.validator';
import { IsLibyanMobileNumber, IsOwnerName } from '../../common/validators/shared-field-checks';
import { normalizePhoneValue } from '../../common/validators/phone-transform';

// What an owner can be identified by at registration. The provisional
// driver's-license path (phase 5A) is gone: only these two exist.
export const REGISTRABLE_IDENTITY_TYPES = ['NATIONAL_ID', 'ADMINISTRATIVE_ID'] as const;

// An owner is an individual: a name in Arabic letters, a national or
// administrative ID, and a mobile number, checked with the shared rules the
// registration form runs. Phase 6: institutions are no longer registered (their
// columns and the rows already there are kept in the database).
export class CreateOwnerDto {
  @ApiProperty()
  @IsString()
  @IsOwnerName()
  fullName!: string;

  @ApiProperty({ enum: REGISTRABLE_IDENTITY_TYPES })
  @IsIn(REGISTRABLE_IDENTITY_TYPES, { message: 'نوع الهوية يجب أن يكون الرقم الوطني أو الرقم الإداري.' })
  identityType!: (typeof REGISTRABLE_IDENTITY_TYPES)[number];

  @ApiProperty({
    description: 'A national ID: 12 digits, 1/2 + birth year + 7 digits. An administrative ID: 10 digits starting with 5 (male) or 6 (female).',
  })
  @Transform(({ value }) => (typeof value === 'string' ? cleanDigits(value) : value))
  @IsString()
  @IsValidIdentityNumber()
  identityNumber!: string;

  @ApiProperty({ description: 'A Libyan mobile number: 09[1-6] + 7 digits (+218 accepted).' })
  @Transform(normalizePhoneValue)
  @IsString()
  @IsLibyanMobileNumber()
  phone!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  // Registration pivot, phase 2: registering an owner is a registration-
  // station action, like registering a vehicle — the actor must be scoped
  // to this station and it must be open in a live municipality. Recorded
  // in the owner's CREATE audit entry (the vehicle carries its own origin
  // columns; plan phase 2 asks for those only).
  @ApiProperty({ description: 'The registration station this owner is being registered at.' })
  @IsString()
  @MinLength(1)
  registrationStationId!: string;
}
