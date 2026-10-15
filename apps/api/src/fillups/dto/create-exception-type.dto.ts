import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { RULE_FAILURE_REASONS } from '../rule-engine/types';

export class CreateExceptionTypeDto {
  @ApiProperty({ description: 'Stable machine key, e.g. "medical_chronic" — never shown to end users.' })
  @IsString()
  @MinLength(1)
  key!: string;

  @ApiProperty({ description: 'Arabic display name shown in the exception-type dropdown.' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ required: false, description: 'Rules this type may override; empty or omitted = any rule.' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(RULE_FAILURE_REASONS, { each: true })
  overridableRules?: string[];

  @ApiProperty({ required: false, description: 'Times it can be used at ONE station in one Tripoli day; omitted = no limit.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  dailyLimitPerStation?: number | null;

  @ApiProperty({ required: false, description: 'A municipality manager creates for their own municipality; the super admin may leave it out (offered everywhere) or name one.' })
  @IsOptional()
  @IsString()
  municipalityId?: string;
}
