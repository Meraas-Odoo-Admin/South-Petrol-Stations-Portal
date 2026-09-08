import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { VehicleUsageType } from '@prisma/client';
import {
  CHASSIS_NUMBER_REGEX,
  LICENSE_PLATE_REGEX,
  REGISTRATION_BOOKLET_REGEX,
} from '../../common/validators/libyan-formats';

export class CreateVehicleDto {
  // Round 5 feedback: no auto-generation existed anywhere for this — it
  // was a plain required text field, which the client flagged as
  // something a station employee shouldn't be typing by hand. Now
  // optional: when omitted, VehiclesService.create() assigns the next
  // "V-######" sequential code itself (see generateInternalCode there).
  // Still accepted when explicitly supplied (e.g. a future bulk-import
  // path, or an admin who wants a specific code) — the uniqueness check
  // in create() still applies to it either way.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  internalCode?: string;

  @ApiProperty({ description: 'City code (1-2 digits) + sequence (1-7 digits), optional hyphen/space separator.' })
  @IsString()
  @Matches(LICENSE_PLATE_REGEX, { message: 'currentPlate must be a city code plus sequence, e.g. "12-3456".' })
  currentPlate!: string;

  // Chassis numbers are case-insensitive on input but stored/compared
  // uppercase (ISO 3779) — normalize before @Matches runs.
  @ApiProperty({ required: false, description: '17-character VIN (ISO 3779), excludes I/O/Q.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsString()
  @Matches(CHASSIS_NUMBER_REGEX, { message: 'chassisNumber must be exactly 17 characters (A-H, J-N, P, R-Z, 0-9).' })
  chassisNumber?: string;

  // A first-time set — this is creation, there's no existing value to
  // displace — so no VehicleChangeRequest approval is needed here. Only
  // changing an ALREADY-SET registrationBooklet on an existing vehicle
  // goes through POST /vehicles/:id/change-requests.
  @ApiProperty({ required: false, description: '6-12 alphanumeric characters.' })
  @IsOptional()
  @IsString()
  @Matches(REGISTRATION_BOOKLET_REGEX, {
    message: 'registrationBooklet must be 6-12 alphanumeric characters.',
  })
  registrationBooklet?: string;

  @ApiProperty({ required: false, description: 'VehicleType lookup row id — see GET /vehicle-types.' })
  @IsOptional()
  @IsString()
  vehicleTypeId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  manufactureYear?: number;

  @ApiProperty({ enum: VehicleUsageType, required: false })
  @IsOptional()
  @IsEnum(VehicleUsageType)
  usageType?: VehicleUsageType;

  // Round 11 item 1: the client confirmed owner information should be
  // mandatory going forward — no longer optional (was `@IsOptional()`
  // ownerId?: string). Vehicle.ownerId itself stays nullable in the
  // DATABASE (existing vehicles with no owner need a backfill decision
  // that hasn't been made — see docs/OPEN_ITEMS.md); this DTO is what
  // actually enforces "mandatory" for every vehicle created from here on.
  @ApiProperty({ description: 'Required — every new vehicle must have an owner.' })
  @IsString()
  @MinLength(1)
  ownerId!: string;
}
