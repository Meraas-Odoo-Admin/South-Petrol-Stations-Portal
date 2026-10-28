import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { VehicleUsageType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Round 11 item 2: real filters/sorting for VehiclesListPage — usageType
// existed already but only as a client-side filter over one loaded page
// (explicitly flagged as an out-of-scope shortcut when the list was first
// built); moved server-side here now that this is a real filters/sorting
// pass, not a visual one, per the round's own instruction to reconsider
// that shortcut deliberately rather than just inherit it.
export enum OwnerIdentityStatusFilter {
  VERIFIED = 'VERIFIED', // owner set, identityType is NATIONAL_ID or ADMINISTRATIVE_ID
  MISSING = 'MISSING', // no owner at all — only possible on vehicles created before item 1's ownerId requirement
}

export enum VehicleSortField {
  CREATED_AT = 'CREATED_AT', // newest-vehicle-first is the default (see VehiclesService.findAll)
  INTERNAL_CODE = 'INTERNAL_CODE',
  CURRENT_PLATE = 'CURRENT_PLATE',
  // Sorting by "most recent fill-up" needs an aggregate join against
  // FillUpTransaction (MAX(occurredAt) per vehicle) that isn't built yet —
  // flagged in docs/OPEN_ITEMS.md rather than rushed, not silently
  // dropped from the enum.
}

export class FindVehiclesQueryDto extends PaginationQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  internalCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  currentPlate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  chassisNumber?: string;

  // Independent from the three fields above (which AND together for a
  // precise lookup) — this ORs a single typed term across internalCode,
  // currentPlate, chassisNumber, and (round 11 item 2) the owner's
  // fullName/identityNumber, for a free-text "find this vehicle or its
  // owner" search where the caller doesn't know (or care) which field it
  // matches.
  @ApiProperty({
    required: false,
    description: 'Free-text OR search across internalCode, currentPlate, chassisNumber, registrationBooklet, and owner fullName/identityNumber.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ enum: VehicleUsageType, required: false })
  @IsOptional()
  @IsEnum(VehicleUsageType)
  usageType?: VehicleUsageType;

  @ApiProperty({ required: false, description: 'Exact match on Vehicle.make — the manufacturer field.' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ required: false, description: 'VehicleType lookup row id — see GET /vehicle-types.' })
  @IsOptional()
  @IsString()
  vehicleTypeId?: string;

  @ApiProperty({ enum: OwnerIdentityStatusFilter, required: false })
  @IsOptional()
  @IsEnum(OwnerIdentityStatusFilter)
  ownerIdentityStatus?: OwnerIdentityStatusFilter;

  @ApiProperty({ enum: VehicleSortField, required: false, default: VehicleSortField.CREATED_AT })
  @IsOptional()
  @IsEnum(VehicleSortField)
  sort?: VehicleSortField;

  // After review (19 Oct 2026): only vehicles whose plate number another
  // vehicle also has (told apart by their chassis numbers), sorted by plate.
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  duplicatePlate?: boolean;

  // After review (28 Oct 2026): the office the vehicle was registered at.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  registrationStationId?: string;

  // After review (28 Oct 2026): registered on these Libya days, inclusive.
  @ApiProperty({ required: false, example: '2026-10-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be a calendar day, YYYY-MM-DD.' })
  from?: string;

  @ApiProperty({ required: false, example: '2026-10-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be a calendar day, YYYY-MM-DD.' })
  to?: string;

  // true: answer {total, skip, take, items} (the vehicles list screen). Left
  // out: the bare array of one page that the pickers read.
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  paged?: boolean;
}
