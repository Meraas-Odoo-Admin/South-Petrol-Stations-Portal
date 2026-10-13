import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// The most a single figure may be: no tank, and no truck, holds more.
export const MAX_STOCK_LITERS = 1_000_000;

const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ConfigureStorageDto {
  @ApiProperty({ description: 'Tank capacity in liters' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(1)
  @Max(MAX_STOCK_LITERS)
  capacityLiters!: number;

  @ApiProperty({ description: 'The level when the station starts using the system' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(MAX_STOCK_LITERS)
  openingLevelLiters!: number;

  // The moment the opening level is true for; defaults to now. Never future.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  openedAt?: string;
}

export class RecordDeliveryDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(1)
  @Max(MAX_STOCK_LITERS)
  liters!: number;

  // Date and time of the delivery; defaults to now; never in the future.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiProperty()
  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  truckPlate!: string;

  @ApiProperty({ description: 'بوليصة: the waybill number' })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  waybillNumber!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(80)
  driverName?: string;
}

export class CorrectDeliveryDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(MAX_STOCK_LITERS)
  liters!: number;

  @ApiProperty()
  @Transform(trimmed)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

// The word the supervisor types to confirm a reset.
export const RESET_CONFIRMATION_WORD = 'تصفير';

export class ResetLevelDto {
  @ApiProperty()
  @Transform(trimmed)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  @ApiProperty({ description: `Must be exactly «${RESET_CONFIRMATION_WORD}»` })
  @Transform(trimmed)
  @IsIn([RESET_CONFIRMATION_WORD])
  confirmation!: string;
}

export class StockVisibilityDto {
  @ApiProperty()
  @IsBoolean()
  show!: boolean;
}

export class StockEntriesQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn(['PETROL_95', 'DIESEL', 'KEROSENE'])
  fuelType?: 'PETROL_95' | 'DIESEL' | 'KEROSENE';

  // A page of the deliveries (newest first): skip/take, at most 100 per page.
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  skip?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  take?: number;
}
