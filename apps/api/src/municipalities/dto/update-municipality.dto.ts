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

  // Registration pivot, phase 4a: calendar days in Africa/Tripoli
  // (YYYY-MM-DD); null clears one. Both optional — no deadline means grace
  // indefinitely. The service checks the day is a real date, that awareness
  // starts before the deadline, and demands the typed name when the new
  // deadline is today or earlier (enforcement would start immediately).
  @ApiProperty({ required: false, nullable: true, example: '2026-11-01' })
  @IsOptional()
  @IsString()
  awarenessStartDate?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '2026-12-01' })
  @IsOptional()
  @IsString()
  cardRequiredFromDate?: string | null;
}
