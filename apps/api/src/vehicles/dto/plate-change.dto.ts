import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { LICENSE_PLATE_REGEX } from '../../common/validators/libyan-formats';

export class PlateChangeDto {
  @ApiProperty({ description: 'City code (1-2 digits) + sequence (1-7 digits), optional hyphen/space separator.' })
  @IsString()
  @Matches(LICENSE_PLATE_REGEX, { message: 'newPlate must be a city code plus sequence, e.g. "12-3456".' })
  newPlate!: string;
}
