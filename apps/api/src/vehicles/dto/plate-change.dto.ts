import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IsLibyanPlate } from '../../common/validators/libyan-plate.validator';

export class PlateChangeDto {
  @ApiProperty({ description: 'City code (1-2 digits) + a separator + serial number (1-7 digits). A plate with no separator is refused.' })
  @IsString()
  @IsLibyanPlate()
  newPlate!: string;
}
