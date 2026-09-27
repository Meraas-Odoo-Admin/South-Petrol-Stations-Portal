import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AssignRegistrationStationScopeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  registrationStationId!: string;
}
