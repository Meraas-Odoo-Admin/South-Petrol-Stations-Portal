import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// Archiving takes a written reason (audited). A LIVE municipality also needs
// its name typed, like switching it back to preparing.
export class ArchiveMunicipalityDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  confirmName?: string;
}

// Shared by every "restore" call that carries only a written reason.
export class RestoreDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
