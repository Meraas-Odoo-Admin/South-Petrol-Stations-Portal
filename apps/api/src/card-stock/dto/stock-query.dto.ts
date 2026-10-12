import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { DateRangeQueryDto } from '../../common/dto/date-range-query.dto';

export class StockQueryDto extends DateRangeQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  registrationStationId?: string;
}
