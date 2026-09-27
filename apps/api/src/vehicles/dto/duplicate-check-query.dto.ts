import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MinLength } from 'class-validator';

// GET /vehicles/duplicate-check — the registration screen checks plate,
// chassis and booklet as they're typed, before the employee saves. Every
// field is optional; only the ones supplied are checked.
export class DuplicateCheckQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  currentPlate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsString()
  @MinLength(1)
  chassisNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  registrationBooklet?: string;
}
