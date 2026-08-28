import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { IdentityType } from '@prisma/client';
import { ADMINISTRATIVE_ID_REGEX, NATIONAL_ID_REGEX } from './libyan-formats';

// A driver's identityNumber format depends on the sibling identityType
// field (national ID vs. administrative ID use different 12-digit
// patterns), so this can't be a plain @Matches — it needs to read another
// property off the same object being validated.
@ValidatorConstraint({ name: 'isValidIdentityNumber', async: false })
class IsValidIdentityNumberConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    const identityType = (args.object as { identityType?: IdentityType }).identityType;
    if (identityType === IdentityType.NATIONAL_ID) {
      return NATIONAL_ID_REGEX.test(value);
    }
    if (identityType === IdentityType.ADMINISTRATIVE_ID) {
      return ADMINISTRATIVE_ID_REGEX.test(value);
    }
    // identityType itself is invalid — @IsEnum on that field reports it;
    // don't also fail this field with a confusing message.
    return true;
  }

  defaultMessage(): string {
    return 'identityNumber must be 12 digits starting with 1 or 2 (national ID) or 9 (administrative ID), matching identityType.';
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
