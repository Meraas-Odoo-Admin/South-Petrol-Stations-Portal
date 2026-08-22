import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AssignStationScopeDto {
  @ApiProperty()
  @IsString()
  stationId!: string;
}
