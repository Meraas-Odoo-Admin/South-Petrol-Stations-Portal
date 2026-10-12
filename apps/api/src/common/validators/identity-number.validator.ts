import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { checkAdministrativeId, checkNationalId } from '@fuel-tracking/shared-types';

// An owner's identityNumber format depends on the sibling identityType field
// (national ID vs. administrative ID), so this can't be a plain @Matches - it
// reads another property off the same object being validated.
//
// Phase 5A: the rules are the shared ones in packages/shared-types (the web
// forms run the very same functions), with the Arabic message the person
// reads next to the field. The provisional driver's-license path is gone.
@ValidatorConstraint({ name: 'isValidIdentityNumber', async: false })
class IsValidIdentityNumberConstraint implements ValidatorConstraintInterface {
  private check(value: unknown, args: ValidationArguments) {
    if (typeof value !== 'string') return null;
    const identityType = (args.object as { identityType?: string }).identityType;
    if (identityType === 'NATIONAL_ID') return checkNationalId(value);
    if (identityType === 'ADMINISTRATIVE_ID') return checkAdministrativeId(value);
    // identityType itself is missing or invalid - the @IsIn on that field
    // reports it; don't also fail this field with a confusing message.
    return undefined;
  }

  validate(value: unknown, args: ValidationArguments): boolean {
    const result = this.check(value, args);
    if (result === undefined) return true;
    return result !== null && result.ok;
  }

  defaultMessage(args: ValidationArguments): string {
    const result = this.check(args.value, args);
    if (result && !result.ok) return result.message;
    return 'الرقم غير صحيح.';
  }
}

export function IsValidIdentityNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidIdentityNumberConstraint,
    });
  };
}
