import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MinLength, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { VehicleUsageType } from '@prisma/client';
import { normalizeBooklet, normalizeChassis, VEHICLE_FUEL_TYPES } from '@fuel-tracking/shared-types';
import { IsLibyanPlate } from '../../common/validators/libyan-plate.validator';
import {
  IsBookletNumber,
  IsChassisNumber,
  IsMakeOrModel,
  IsManufactureYearValue,
  IsVehicleColor,
} from '../../common/validators/shared-field-checks';

// Phase 5A: every vehicle carries plate, chassis number, booklet number, make,
// model, colour, manufacturing year and fuel type - all required, all checked
// with the shared rules (packages/shared-types/validation.ts), the same ones
// the registration form runs.
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

  @ApiProperty({
    description:
      'City code (1-2 digits) + a separator + serial number (1-7 digits), digits only. A plate with no separator is refused.',
  })
  @IsString()
  @IsLibyanPlate()
  currentPlate!: string;

  // Upper-cased and stripped of spaces before the check runs.
  @ApiProperty({ description: '17 characters (ISO 3779); 6-20 only with chassisNonStandard.' })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeChassis(value) : value))
  @IsString()
  @IsChassisNumber('chassisNonStandard')
  chassisNumber!: string;

  // Ticked when the booklet's chassis number is not the usual 17 characters.
  // Recorded and shown on the vehicle.
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  chassisNonStandard?: boolean;

  // A first-time set — this is creation, there's no existing value to
  // displace — so no VehicleChangeRequest approval is needed here. Only
  // changing an ALREADY-SET registrationBooklet on an existing vehicle
  // goes through POST /vehicles/:id/change-requests.
  @ApiProperty({ description: '6-12 digits.' })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeBooklet(value) : value))
  @IsString()
  @IsBookletNumber()
  registrationBooklet!: string;

  // Required (after review, 19 Oct 2026): every vehicle has a type — the
  // plate-sharing rule (two vehicles at most, of different types) needs it.
  @ApiProperty({ description: 'VehicleType lookup row id — see GET /vehicle-types.' })
  @IsString()
  @IsNotEmpty()
  vehicleTypeId!: string;

  // Free text, typed exactly as written in the booklet. No lists.
  @ApiProperty({ description: 'The make (الصانع), as written in the booklet.' })
  @IsString()
  @IsMakeOrModel('الصانع')
  make!: string;

  @ApiProperty({ description: 'The model (الطراز), as written in the booklet.' })
  @IsString()
  @IsMakeOrModel('الطراز')
  model!: string;

  // A colour from the list, or free text for «أخرى».
  @ApiProperty()
  @IsString()
  @IsVehicleColor()
  color!: string;

  @ApiProperty({ description: '4 digits, from 1950 to next year.' })
  @Transform(({ value }) => (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value))
  @IsManufactureYearValue()
  manufactureYear!: number;

  // The fuel the vehicle runs on. A pump choice that does not match is
  // warned about and recorded, never blocked.
  @ApiProperty({ enum: VEHICLE_FUEL_TYPES })
  @IsIn(VEHICLE_FUEL_TYPES, { message: 'نوع وقود المركبة مطلوب: بنزين أو ديزل.' })
  fuelType!: (typeof VEHICLE_FUEL_TYPES)[number];

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

  // Registration pivot, phase 2: every registration happens AT a
  // registration station — recorded on the vehicle as
  // registeredAtRegistrationStationId, with the actor as registeredById.
  // The actor must be scoped to it, and it must be ACTIVE in a LIVE
  // municipality (RegistrationStationsService.assertCanRegisterAt).
  @ApiProperty({ description: 'The registration station this vehicle is being registered at.' })
  @IsString()
  @MinLength(1)
  registrationStationId!: string;
}
