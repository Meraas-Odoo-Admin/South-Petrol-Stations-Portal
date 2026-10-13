import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DateRangeQueryDto } from '../../common/dto/date-range-query.dto';

export class StockQueryDto extends DateRangeQueryDto {
  // A page of the entries (newest first). The reconciliation and the exports
  // ignore these.
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  registrationStationId?: string;
}
