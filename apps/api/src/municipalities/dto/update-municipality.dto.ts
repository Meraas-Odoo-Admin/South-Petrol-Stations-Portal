import { ApiProperty } from '@nestjs/swagger';
import { MunicipalityStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MinLength, MaxLength } from 'class-validator';

export class UpdateMunicipalityDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  // The municipality's security directorate (created automatically as
  // «مديرية أمن ‹الاسم›»). Only the super admin renames it.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  securityAuthorityName?: string;

  // The activation switch (Phase 6): LIVE marks the municipality as working
  // since now, PREPARING switches it off and needs a `reason`. It gates nothing.
  @ApiProperty({ required: false, enum: MunicipalityStatus })
  @IsOptional()
  @IsEnum(MunicipalityStatus)
  status?: MunicipalityStatus;

  // Required (written, 3+ characters) when switching the municipality off.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason?: string;

  // Registration pivot, phase 3: card-number prefix (SBH-7K2M9Q4X). 2–5
  // uppercase letters, unique. Changing it only affects cards issued after.
  @ApiProperty({ required: false, example: 'SBH' })
  @IsOptional()
  @Matches(/^[A-Z]{2,5}$/, { message: 'code must be 2-5 uppercase letters.' })
  code?: string;
}
