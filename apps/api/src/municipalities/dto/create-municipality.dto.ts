import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateMunicipalityDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;
}
