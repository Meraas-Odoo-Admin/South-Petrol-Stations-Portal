import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { VehicleUsageType } from '@prisma/client';

export class CreateVehicleDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  internalCode!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  currentPlate!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  chassisNumber?: string;

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
