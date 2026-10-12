import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { OwnerKind } from '@prisma/client';
import { cleanDigits } from '@fuel-tracking/shared-types';
import { IsValidIdentityNumber } from '../../common/validators/identity-number.validator';
import {
  IsArabicPersonName,
  IsLibyanMobileNumber,
  IsNationalIdNumber,
  IsOptionalLibyanMobile,
  IsOwnerName,
} from '../../common/validators/shared-field-checks';
import { normalizePhoneValue } from '../../common/validators/phone-transform';

// What an owner can be identified by at registration. The provisional
// driver's-license path (phase 5A) is gone: only these two exist.
export const REGISTRABLE_IDENTITY_TYPES = ['NATIONAL_ID', 'ADMINISTRATIVE_ID'] as const;

const isIndividual = (o: CreateOwnerDto) => o.ownerKind !== OwnerKind.INSTITUTION;

// Phase 5A: an owner is an individual (فرد) or an institution (جهة / مؤسسة).
//  - An individual has a name in Arabic letters, a national or administrative
//    ID, and a mobile number - checked with the shared rules, the same ones
//    the registration form runs.
//  - An institution has its name (shown as the owner's name everywhere) and
//    the NATIONAL ID of the responsible driver, checked with every national-ID
//    rule including 18+. The driver's name and phone are optional.
export class CreateOwnerDto {
  @ApiProperty({ enum: OwnerKind, required: false, default: OwnerKind.INDIVIDUAL })
  @IsOptional()
  @IsEnum(OwnerKind)
  ownerKind?: OwnerKind;

  // The person's name, or the institution's name when ownerKind is INSTITUTION.
  @ApiProperty()
  @IsString()
  @IsOwnerName()
  fullName!: string;

  @ApiProperty({ enum: REGISTRABLE_IDENTITY_TYPES, required: false })
  @ValidateIf(isIndividual)
  @IsIn(REGISTRABLE_IDENTITY_TYPES, { message: 'نوع الهوية يجب أن يكون الرقم الوطني أو الرقم الإداري.' })
  identityType?: (typeof REGISTRABLE_IDENTITY_TYPES)[number];

  @ApiProperty({
    required: false,
    description: '12 digits: 1/2 + birth year + 7 digits for a national ID, 9 + 11 digits for an administrative ID.',
  })
  @ValidateIf(isIndividual)
  @Transform(({ value }) => (typeof value === 'string' ? cleanDigits(value) : value))
  @IsString()
  @IsValidIdentityNumber()
  identityNumber?: string;

  // Required for an individual; optional for an institution.
  @ApiProperty({ required: false, description: 'A Libyan mobile number: 09[1-6] + 7 digits (+218 accepted).' })
  @ValidateIf((o: CreateOwnerDto) => isIndividual(o) || (o.phone !== undefined && o.phone !== ''))
  @Transform(normalizePhoneValue)
  @IsString()
  @IsLibyanMobileNumber()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  // ── institution only ────────────────────────────────────────────────
  @ApiProperty({ required: false, description: 'National ID of the responsible driver (institutions).' })
  @ValidateIf((o: CreateOwnerDto) => o.ownerKind === OwnerKind.INSTITUTION)
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
