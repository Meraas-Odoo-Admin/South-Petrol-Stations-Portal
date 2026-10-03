import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

// internalCode, currentPlate, chassisNumber, and registrationBooklet are
// deliberately absent — internalCode is the permanent identity (never
// mutated), and currentPlate only changes through
// POST /vehicles/:id/plate-change so the history table stays authoritative.
// chassisNumber/registrationBooklet follow the same identity-field logic,
// but via POST /vehicles/:id/change-requests (approval-gated once a value
// is already set — see VehicleChangeRequest).
//
// Round 12: ownerId and usageType are ALSO absent now, for the same
// approval-gating reason — the client wants edits split by whether they
// affect fill-up rule eligibility. The rule engine keys strictly off
// vehicleId + ownerId (FillUpRuleEngine), so a vehicle's owner is
// rule-affecting; usageType is included pre-emptively since a
// per-usage-type liter cap SystemSetting already exists even though it
// isn't wired into the engine yet. Both now go through
// POST /vehicles/:id/change-requests (VehicleChangeType.OWNER_CHANGE /
// USAGE_TYPE_CHANGE) instead of this direct-PATCH path. Everything left
// here (vehicleTypeId, model, color, manufactureYear) is cosmetic — it
// doesn't feed the rule engine at all, so it saves immediately.
export class UpdateVehicleDto {
  @ApiProperty({ required: false, description: 'VehicleType lookup row id — see GET /vehicle-types.' })
  @IsOptional()
  @IsString()
  vehicleTypeId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  manufactureYear?: number;
}
