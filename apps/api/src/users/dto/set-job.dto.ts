import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';

export class SetJobDto {
  @ApiProperty()
  @IsString()
  roleId!: string;

  // Petrol stations for a fuel job, registration stations for a registration
  // job. Required when the new job is on the other side from the old one
  // (the old side's places are dropped); optional otherwise.
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  placeIds?: string[];
}
