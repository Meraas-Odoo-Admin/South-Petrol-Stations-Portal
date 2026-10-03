import { ApiProperty } from '@nestjs/swagger';
import { IsBooleanString, IsOptional, IsString } from 'class-validator';

export class FindStandingExceptionsQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  // String, not boolean — query params arrive as strings over HTTP; kept
  // as IsBooleanString rather than wiring up class-transformer's
  // @Transform/@Type boolean coercion for one field.
  @ApiProperty({ required: false, description: '"true" to exclude revoked/expired grants.' })
  @IsOptional()
  @IsBooleanString()
  activeOnly?: string;
}
