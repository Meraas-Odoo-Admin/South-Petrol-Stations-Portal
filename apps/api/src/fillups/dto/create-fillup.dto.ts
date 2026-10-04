import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';
import { FuelType } from '@prisma/client';

export class CreateFillUpDto {
  // Phase 4a: how the vehicle is identified. At least one of vehicleId,
  // cardNumber (a scan) or plate (typed) is required. The server decides what
  // it all means: a cardNumber must be an active card (and its vehicle wins);
  // a typed plate that matches a registered vehicle IS that vehicle; only a
  // plate matching none is recorded as an unregistered vehicle.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiProperty({ required: false, description: 'The card number read from the QR, when the card was scanned.' })
  @IsOptional()
  @IsString()
  cardNumber?: string;

  @ApiProperty({ required: false, description: 'The plate exactly as the employee typed it.' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  plate?: string;

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

  // Phase 4a, from the card deadline on: a station supervisor authorizes ONE
  // fill-up for a vehicle that would be refused for having no card. Needs
  // the fillups:emergency_override permission (checked server-side) and a
  // written reason. Waives only the card requirement — the gap and weekly
  // limits still apply.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  emergencyOverride?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string;
}
