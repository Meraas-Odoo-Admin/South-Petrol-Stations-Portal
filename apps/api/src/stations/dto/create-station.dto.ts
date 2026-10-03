import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { FuelType, StationOwnershipType, StationStatus } from '@prisma/client';

export class CreateStationDto {
  // Auto-generated ("STN-######") when omitted, same pattern as
  // Vehicle.internalCode (VehiclesService.generateInternalCode) —
  // station-card-field-spec item "الرمز الداخلي": never typed in, the one
  // identifier guaranteed unique across every company's overlapping
  // numbering. Still accepted when explicitly supplied (bulk-import, an
  // admin who wants a specific code) — StationsService.create's own
  // uniqueness check still applies to it either way.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  internalCode?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  stationNumber!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty()
  @IsString()
  companyId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  municipalityId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  routeId?: string;

  // No securityAuthorityId: a station's security authority is its
  // municipality's (one per municipality — OPEN_ITEMS.md #4, answered),
  // never chosen per station. With forbidNonWhitelisted, sending it is
  // now a 400 rather than silently ignored.

  @ApiProperty({ enum: StationStatus, required: false })
  @IsOptional()
  @IsEnum(StationStatus)
  status?: StationStatus;

  // Only meaningful once status !== ACTIVE — StationsService doesn't
  // enforce that at the API level (a station's status can change later
  // without this being resubmitted), the form is what conditions showing
  // the field on status.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  statusNote?: string;

  @ApiProperty({ enum: StationOwnershipType, required: false })
  @IsOptional()
  @IsEnum(StationOwnershipType)
  ownershipType?: StationOwnershipType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  supervisorName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  supervisorPhone?: string;

  // When true, StationsService.create ignores operatorName/operatorPhone
  // below (if sent) and stores the operator as unset — readers fall back
  // to the supervisor fields instead of a duplicated copy that could go
  // stale if the supervisor's own number changes later.
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  operatorSameAsSupervisor?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  operatorName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  operatorPhone?: string;

  // station-card-field-spec item 10 — a station can offer more than one,
  // so a plain multi-select array, not a single enum field. Genuinely
  // unbuilt before this: StationFuelAvailability existed only in the
  // schema (docs/OPEN_ITEMS.md's "Resolved" section confirms the MODEL
  // decision — time-varying, its own join table — but no service,
  // controller, or UI ever consumed it). Left optional — the sparse
  // "station with almost nothing known yet" case the spec itself calls
  // out shouldn't be blocked on this.
  @ApiProperty({ enum: FuelType, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(FuelType, { each: true })
  fuelTypes?: FuelType[];
}
