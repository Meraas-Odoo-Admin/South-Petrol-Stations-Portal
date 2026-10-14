import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, Max, MinLength } from 'class-validator';
import { FuelType } from '@prisma/client';
import { MAX_FILLUP_LITERS, NO_CARD_REASONS } from '@fuel-tracking/shared-types';

export class CreateFillUpDto {
  // Phase 6: a fill-up is recorded from a CARD SCAN (cardNumber), which must be
  // an active card (its vehicle wins). The only other way in is a REGISTERED
  // vehicle named by vehicleId together with noCardReason: the pump found it by
  // search because its card could not be used. Anything else is 409
  // CARD_REQUIRED; a plate typed on its own is never accepted.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiProperty({ required: false, description: 'The card number read from the QR, when the card was scanned.' })
  @IsOptional()
  @IsString()
  cardNumber?: string;

  @ApiProperty({ required: false, enum: NO_CARD_REASONS, description: 'Why the card could not be used (with vehicleId, no cardNumber).' })
  @IsOptional()
  @IsIn(NO_CARD_REASONS, { message: 'سبب عدم استخدام البطاقة غير صالح.' })
  noCardReason?: (typeof NO_CARD_REASONS)[number];

  @ApiProperty()
  @IsString()
  stationId!: string;

  @ApiProperty({ enum: FuelType })
  @IsEnum(FuelType)
  fuelType!: FuelType;

  // Positive, and below the ceiling no real tank reaches (MAX_FILLUP_LITERS
  // in the shared rules - the pump form checks the same number).
  @ApiProperty()
  @IsNumber()
  @IsPositive({ message: 'الكمية يجب أن تكون رقمًا أكبر من صفر.' })
  @Max(MAX_FILLUP_LITERS, { message: `الكمية كبيرة جدًا — الحد الأقصى ${MAX_FILLUP_LITERS} لترًا في التعبئة الواحدة.` })
  quantityLiters!: number;

  // Defaults to server "now" if omitted.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  // Exception mode (Phase 6): when a rule blocks the fill-up, the employee picks
  // an active exception type and writes a short reason. No approval step.
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
