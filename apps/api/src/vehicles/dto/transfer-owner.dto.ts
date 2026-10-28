import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

// After review (28 Oct 2026): «نقل الملكية» — the vehicle was sold. The new
// owner is an owner already in the registry (found or registered first by
// identity number); the reason is kept with the cancelled card.
export class TransferOwnerDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  ownerId!: string;

  @ApiProperty({ example: 'بيع المركبة' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
