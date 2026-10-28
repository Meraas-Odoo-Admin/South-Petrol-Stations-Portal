import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

// After review (28 Oct 2026): «فك المركبة من المالك» — why, kept with the
// cancelled card and in the audit log.
export class DetachOwnerDto {
  @ApiProperty({ example: 'المركبة ليست لهذا المالك' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
