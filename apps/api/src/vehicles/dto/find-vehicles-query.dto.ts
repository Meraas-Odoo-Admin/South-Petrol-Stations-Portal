import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
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
  PROVISIONAL = 'PROVISIONAL', // owner set, identityType is DRIVERS_LICENSE (round 11 item 1)
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
    description: 'Free-text OR search across internalCode, currentPlate, chassisNumber, and owner fullName/identityNumber.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ enum: VehicleUsageType, required: false })
  @IsOptional()
  @IsEnum(VehicleUsageType)
  usageType?: VehicleUsageType;

  @ApiProperty({ required: false, description: 'Exact match on Vehicle.model — the brand/manufacturer field.' })
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
}
