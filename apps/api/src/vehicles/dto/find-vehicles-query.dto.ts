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

  // Independent from the three fields above (which AND together for a
  // precise lookup) — this ORs a single typed term across internalCode and
  // currentPlate, for a free-text "find this vehicle" search where the
  // caller doesn't know (or care) which field it matches.
  @ApiProperty({ required: false, description: 'Free-text OR search across internalCode and currentPlate.' })
  @IsOptional()
  @IsString()
  search?: string;
}
