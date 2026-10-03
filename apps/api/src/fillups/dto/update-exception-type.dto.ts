import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

// key is deliberately absent — immutable after creation, same reasoning as
// every other identity field in this codebase (Driver.identityNumber,
// Vehicle.internalCode, User.username).
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
}
