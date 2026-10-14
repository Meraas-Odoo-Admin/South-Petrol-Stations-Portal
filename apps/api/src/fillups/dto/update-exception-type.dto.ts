import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { RULE_FAILURE_REASONS } from '../rule-engine/types';

// key and municipalityId are deliberately absent — immutable after creation,
// same reasoning as every other identity field in this codebase.
export class UpdateExceptionTypeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  requiresProof?: boolean;

  @ApiProperty({ required: false, description: 'Deactivate instead of deleting — no DELETE endpoints exist anywhere in this system.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, description: 'Empty = any rule.' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(RULE_FAILURE_REASONS, { each: true })
  overridableRules?: string[];

  @ApiProperty({ required: false, description: 'null clears the limit.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  dailyLimitPerStation?: number | null;
}
