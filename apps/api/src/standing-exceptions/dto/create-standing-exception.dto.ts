import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

// Mirrors RuleFailureReason (apps/api/src/fillups/rule-engine/types.ts) —
// duplicated as a plain string union here rather than imported, so this
// DTO doesn't reach into the rule-engine's internal module for a type that
// only needs to exist at the validation boundary.
export const STANDING_EXCEPTION_RULES = [
  'VEHICLE_GAP_TOO_SHORT',
  'VEHICLE_WEEKLY_CAP_REACHED',
  'DRIVER_GAP_TOO_SHORT',
  'DRIVER_WEEKLY_CAP_REACHED',
  'LITERS_PER_PERSON_CAP_REACHED',
] as const;

export class CreateStandingExceptionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiProperty({ enum: STANDING_EXCEPTION_RULES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(STANDING_EXCEPTION_RULES, { each: true })
  rules!: string[];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason!: string;

  @ApiProperty({ required: false, description: 'Omit for an indefinite grant, active until revoked.' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
