import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DateRangeQueryDto } from '../../common/dto/date-range-query.dto';

export class ReadinessQueryDto extends DateRangeQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  municipalityId?: string;

  // The look-back for the headline estimate: cardless plates seen, and cards
  // issued, over the last N days. Default 14.
  @ApiProperty({ required: false, minimum: 1, maximum: 90, default: 14 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number = 14;
}
