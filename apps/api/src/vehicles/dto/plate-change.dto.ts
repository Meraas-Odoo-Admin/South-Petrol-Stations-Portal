import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class PlateChangeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  newPlate!: string;
}
