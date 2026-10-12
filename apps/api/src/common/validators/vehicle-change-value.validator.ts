import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { VehicleChangeType, VehicleUsageType } from '@prisma/client';
import { checkBooklet, checkChassis } from '@fuel-tracking/shared-types';
import { isLibyanPlate } from './libyan-plate.validator';

// requestedValue's format depends on the sibling changeType field, same
// reasoning as IsValidIdentityNumber for Driver.identityNumber.
//
// Round 12: OWNER_CHANGE/USAGE_TYPE_CHANGE added — these route
// rule-affecting vehicle edits through the same approval flow chassis/
// booklet changes already use (see VehicleChangeType's own schema comment).
// requestedValue holds a VehicleOwner id (OWNER_CHANGE, existence checked at
// the service layer in setOrRequestChange, same as CreateVehicleDto.ownerId)
// or a VehicleUsageType enum value (USAGE_TYPE_CHANGE, checkable here).
@ValidatorConstraint({ name: 'isValidVehicleChangeValue', async: false })
class IsValidVehicleChangeValueConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    const changeType = (args.object as { changeType?: VehicleChangeType }).changeType;
    if (changeType === VehicleChangeType.CHASSIS_CHANGE) {
      // The shared chassis rule: 17 characters, or 6-20 with the tick.
      const nonStandard = Boolean((args.object as { chassisNonStandard?: boolean }).chassisNonStandard);
      return checkChassis(value, nonStandard).ok;
    }
    if (changeType === VehicleChangeType.BOOKLET_CHANGE) {
      return checkBooklet(value).ok;
    }
    if (changeType === VehicleChangeType.OWNER_CHANGE) {
      return value.trim().length > 0;
    }
    if (changeType === VehicleChangeType.USAGE_TYPE_CHANGE) {
      return Object.values(VehicleUsageType).includes(value as VehicleUsageType);
    }
    if (changeType === VehicleChangeType.PLATE_CHANGE) {
      return isLibyanPlate(value);
    }
    if (changeType === VehicleChangeType.VEHICLE_TYPE_CHANGE) {
      return value.trim().length > 0;
    }
    // changeType itself is invalid — @IsEnum on that field reports it.
    return true;
  }

  defaultMessage(): string {
    return 'القيمة المطلوبة لا تطابق نوع التعديل: رقم هيكل من 17 خانة (أو 6–20 مع «رقم هيكل غير قياسي»)، أو رقم دفتر من 6 إلى 12 خانة، أو لوحة بصيغة صحيحة، أو معرّف مالك أو نوع مركبة موجود.';
  }
}

export function IsValidVehicleChangeValue(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidVehicleChangeValueConstraint,
    });
  };
}
