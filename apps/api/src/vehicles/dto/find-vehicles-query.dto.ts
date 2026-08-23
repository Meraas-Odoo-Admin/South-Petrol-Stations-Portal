import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindVehiclesQueryDto extends PaginationQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  internalCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  currentPlate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  chassisNumber?: string;
}
