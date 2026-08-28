import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { VehicleChangeType } from '@prisma/client';
import { CHASSIS_NUMBER_REGEX, REGISTRATION_BOOKLET_REGEX } from './libyan-formats';

// requestedValue's format depends on the sibling changeType field, same
// reasoning as IsValidIdentityNumber for Driver.identityNumber.
@ValidatorConstraint({ name: 'isValidVehicleChangeValue', async: false })
class IsValidVehicleChangeValueConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    const changeType = (args.object as { changeType?: VehicleChangeType }).changeType;
    if (changeType === VehicleChangeType.CHASSIS_CHANGE) {
      return CHASSIS_NUMBER_REGEX.test(value);
    }
    if (changeType === VehicleChangeType.BOOKLET_CHANGE) {
      return REGISTRATION_BOOKLET_REGEX.test(value);
    }
    // changeType itself is invalid — @IsEnum on that field reports it.
    return true;
  }

  defaultMessage(): string {
    return 'requestedValue must be a 17-character chassis number (CHASSIS_CHANGE) or a 6-12 character alphanumeric registration booklet number (BOOKLET_CHANGE), matching changeType.';
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
