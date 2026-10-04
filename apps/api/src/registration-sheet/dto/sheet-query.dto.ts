import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// Exactly one of the two: a petrol station (its municipality is used; the
// caller's station scope applies) or, for admins who see every station, a
// municipality directly.
export class SheetQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  stationId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  municipalityId?: string;
}
