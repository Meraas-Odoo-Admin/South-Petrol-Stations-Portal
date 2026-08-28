import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { VehicleUsageType } from '@prisma/client';

// internalCode, currentPlate, chassisNumber, and registrationBooklet are
// deliberately absent — internalCode is the permanent identity (never
// mutated), and currentPlate only changes through
// POST /vehicles/:id/plate-change so the history table stays authoritative.
// chassisNumber/registrationBooklet follow the same identity-field logic,
// but via POST /vehicles/:id/change-requests (approval-gated once a value
// is already set — see VehicleChangeRequest).
export class UpdateVehicleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vehicleType?: string;

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ownerId?: string;
}
