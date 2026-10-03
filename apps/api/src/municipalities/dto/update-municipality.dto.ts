import { ApiProperty } from '@nestjs/swagger';
import { MunicipalityStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

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

  // Required, and must equal the municipality's current name exactly, when
  // switching LIVE -> PREPARING: that instantly stops every fill-up there,
  // so the admin screen makes the admin type the name — and the API
  // insists on the same, not just the UI.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  confirmName?: string;

  // Registration pivot, phase 3: card-number prefix (SBH-7K2M9Q4X). 2–5
  // uppercase letters, unique. Changing it only affects cards issued after.
  @ApiProperty({ required: false, example: 'SBH' })
  @IsOptional()
  @Matches(/^[A-Z]{2,5}$/, { message: 'code must be 2-5 uppercase letters.' })
  code?: string;
}
