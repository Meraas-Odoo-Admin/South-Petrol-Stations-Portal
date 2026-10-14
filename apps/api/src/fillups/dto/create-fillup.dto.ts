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
import { MAX_FILLUP_LITERS } from '@fuel-tracking/shared-types';

export class CreateFillUpDto {
  // Phase 6: a fill-up is recorded from a CARD SCAN (cardNumber), which must be
  // an active card (its vehicle wins). vehicleId and plate are read ONLY with an
  // emergency override, and must name a REGISTERED vehicle; without a card or an
  // override the answer is 409 CARD_REQUIRED.
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
  // Positive, and below the ceiling no real tank reaches (MAX_FILLUP_LITERS
  // in the shared rules - the pump form checks the same number).
  @ApiProperty()
  @IsNumber()
  @IsPositive({ message: 'الكمية يجب أن تكون رقمًا أكبر من صفر.' })
  @Max(MAX_FILLUP_LITERS, { message: `الكمية كبيرة جدًا — الحد الأقصى ${MAX_FILLUP_LITERS} لترًا في التعبئة الواحدة.` })
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
