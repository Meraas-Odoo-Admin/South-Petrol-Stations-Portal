import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { VehicleChangeRequestStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindOwnerChangeRequestsQueryDto extends PaginationQueryDto {
  @ApiProperty({ enum: VehicleChangeRequestStatus, required: false })
  @IsOptional()
  @IsEnum(VehicleChangeRequestStatus)
  status?: VehicleChangeRequestStatus;
}
