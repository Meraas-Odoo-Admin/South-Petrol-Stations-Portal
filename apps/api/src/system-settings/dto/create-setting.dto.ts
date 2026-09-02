import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateSettingDto {
  // Dotted lower_snake_case, matching every existing key (e.g.
  // "fillup.max_per_week") — not enforced elsewhere since existing keys
  // only ever come from seed.ts, but a key typed by an admin through this
  // new UI affordance needs the same shape or it won't read predictably.
  @ApiProperty()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, {
    message: 'key must look like "category.setting_name" (lowercase, dot-separated).',
  })
  key!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  value!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
