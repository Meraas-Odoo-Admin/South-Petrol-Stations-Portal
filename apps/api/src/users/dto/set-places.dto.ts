import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class SetPlacesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  placeIds!: string[];
}
