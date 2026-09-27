import { ApiProperty } from '@nestjs/swagger';
import { RegistrationStationStatus } from '@prisma/client';
import { IsEnum, IsLatitude, IsLongitude, IsOptional, IsString, Matches, MinLength } from 'class-validator';

// A desk landline or duty phone as often as a mobile — deliberately looser
// than LIBYAN_MOBILE_REGEX: digits with optional leading +, spaces or dashes.
export const CONTACT_PHONE_REGEX = /^\+?\d[\d\s-]{5,19}$/;

// Registration pivot, phase 2 (plan §4). No security-authority field: it
// comes from the municipality (Phase 1). internalCode is never supplied —
// always generated (REG-######).
export class CreateRegistrationStationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ required: false, description: 'The police station’s official code, if it has one.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  officialCode?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  municipalityId!: string;

  @ApiProperty({ description: 'Free text — Libyan street addresses are not standardized.' })
  @IsString()
  @MinLength(1)
  address!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(CONTACT_PHONE_REGEX, { message: 'contactPhone must be a phone number.' })
  contactPhone?: string;

  @ApiProperty({ required: false, description: 'Free text, e.g. "السبت–الخميس 8:00–14:00".' })
  @IsOptional()
  @IsString()
  workingHours?: string;

  @ApiProperty({ enum: RegistrationStationStatus, required: false })
  @IsOptional()
  @IsEnum(RegistrationStationStatus)
  status?: RegistrationStationStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  statusNote?: string;
}
