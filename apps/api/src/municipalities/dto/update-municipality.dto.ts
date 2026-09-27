import { ApiProperty } from '@nestjs/swagger';
import { MunicipalityStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateMunicipalityDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  // PREPARING -> LIVE is the go-live switch for a municipality (see the
  // schema comment on Municipality.status). Replaces the old, unused
  // isActive flag here.
  @ApiProperty({ required: false, enum: MunicipalityStatus })
  @IsOptional()
  @IsEnum(MunicipalityStatus)
  status?: MunicipalityStatus;
}
