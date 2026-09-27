import { PartialType } from '@nestjs/swagger';
import { CreateRegistrationStationDto } from './create-registration-station.dto';

export class UpdateRegistrationStationDto extends PartialType(CreateRegistrationStationDto) {}
