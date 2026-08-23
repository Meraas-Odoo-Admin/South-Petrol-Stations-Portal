import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MinLength,
} from 'class-validator';
import { FuelType } from '@prisma/client';

export class CreateFillUpDto {
  @ApiProperty()
  @IsString()
  vehicleId!: string;

  @ApiProperty()
  @IsString()
  driverId!: string;

  @ApiProperty()
  @IsString()
  stationId!: string;

  @ApiProperty({ enum: FuelType })
  @IsEnum(FuelType)
  fuelType!: FuelType;

  // Sanity ceiling, not a client-specified limit — adjust freely if a real
  // tank/dispense volume ever plausibly exceeds this.
  @ApiProperty()
  @IsNumber()
  @IsPositive()
  @Max(1000)
  quantityLiters!: number;

  // Defaults to server "now" if omitted — see the M3 report for reasoning.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  // Presence of ANY of these three puts the request in "exception mode":
  // the rule engine is bypassed entirely and reason becomes mandatory.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  exceptionTypeId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  proofReference?: string;
}
