import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateSettingDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  value!: string;
}
