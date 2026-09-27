import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { IdentityType } from '@prisma/client';
import { IsValidIdentityNumber } from '../../common/validators/identity-number.validator';
import { LIBYAN_MOBILE_REGEX } from '../../common/validators/libyan-formats';

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

  // Round 20: required going forward. The client's original reason was
  // the WhatsApp share (removed in registration pivot phase 2); kept
  // required until the client says otherwise — whether a phone is still
  // needed is part of the open "what must an owner bring" question. Existing VehicleOwner rows created before this
  // change keep phone nullable in the schema/UpdateOwnerDto (no backfill
  // decision has been made for them, same "mandatory going forward, not
  // retroactive" pattern already used for CreateVehicleDto.ownerId in
  // round 11) — this DTO is what actually enforces it for every owner
  // created from here on.
  @ApiProperty({ description: 'Required — must look like a real Libyan mobile number.' })
  @IsString()
  @Matches(LIBYAN_MOBILE_REGEX, { message: 'phone must be a valid Libyan mobile number.' })
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
