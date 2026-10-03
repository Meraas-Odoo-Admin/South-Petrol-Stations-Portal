import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { FuelType, StationOwnershipType, StationStatus } from '@prisma/client';

export class UpdateStationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

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

  @ApiProperty({ required: false })
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

  // A full replace when supplied — StationsService.update deletes any
  // StationFuelAvailability row not in this list and upserts the rest,
  // matching how an admin-editable multi-select naturally behaves
  // ("this is now the full set"), not an incremental add/remove.
  @ApiProperty({ enum: FuelType, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(FuelType, { each: true })
  fuelTypes?: FuelType[];
}
