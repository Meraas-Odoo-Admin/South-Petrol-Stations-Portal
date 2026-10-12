import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import {
  checkAdministrativeId,
  checkArabicPersonName,
  checkBooklet,
  checkChassis,
  checkColor,
  checkInstitutionName,
  checkLibyanMobile,
  checkLiters,
  checkManufactureYear,
  checkMakeOrModel,
  checkNationalId,
  type FieldCheck,
} from '@fuel-tracking/shared-types';

// Phase 5A: class-validator decorators over the ONE set of field rules in
// packages/shared-types (validation.ts). The web forms call the same
// functions, so a value the form accepts is a value the API accepts, and the
// Arabic message next to the field is the same text on both sides.

type Check = (value: string, args: ValidationArguments) => FieldCheck;

function fieldDecorator(name: string, check: Check, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name,
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          return typeof value === 'string' && check(value, args).ok;
        },
        defaultMessage(args: ValidationArguments) {
          const value = args.value;
          if (typeof value !== 'string') return 'القيمة غير صحيحة.';
          const result = check(value, args);
          return result.ok ? '' : result.message;
        },
      },
    });
}

export const IsNationalIdNumber = (options?: ValidationOptions) =>
  fieldDecorator('isNationalIdNumber', (v) => checkNationalId(v), options);

export const IsAdministrativeIdNumber = (options?: ValidationOptions) =>
  fieldDecorator('isAdministrativeIdNumber', (v) => checkAdministrativeId(v), options);

export const IsLibyanMobileNumber = (options?: ValidationOptions) =>
  fieldDecorator('isLibyanMobileNumber', (v) => checkLibyanMobile(v, { required: true }), options);

export const IsArabicPersonName = (label: string, options?: ValidationOptions) =>
  fieldDecorator('isArabicPersonName', (v) => checkArabicPersonName(v, label), options);

export const IsInstitutionName = (options?: ValidationOptions) =>
  fieldDecorator('isInstitutionName', (v) => checkInstitutionName(v), options);

export const IsBookletNumber = (options?: ValidationOptions) =>
  fieldDecorator('isBookletNumber', (v) => checkBooklet(v), options);

export const IsVehicleColor = (options?: ValidationOptions) =>
  fieldDecorator('isVehicleColor', (v) => checkColor(v), options);

export const IsMakeOrModel = (label: 'الصانع' | 'الطراز', options?: ValidationOptions) =>
  fieldDecorator('isMakeOrModel', (v) => checkMakeOrModel(v, label), options);

// The chassis rule depends on the sibling "non-standard" tick.
export const IsChassisNumber = (tickProperty = 'chassisNonStandard', options?: ValidationOptions) =>
  fieldDecorator(
    'isChassisNumber',
    (v, args) => checkChassis(v, Boolean((args.object as Record<string, unknown>)[tickProperty])),
    options,
  );

export function IsManufactureYearValue(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isManufactureYear',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          return (typeof value === 'number' || typeof value === 'string') && checkManufactureYear(value).ok;
        },
        defaultMessage(args: ValidationArguments) {
          const result = checkManufactureYear(args.value as string | number);
          return result.ok ? '' : result.message;
        },
      },
    });
}

export function IsLitersValue(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isLitersValue',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          return (typeof value === 'number' || typeof value === 'string') && checkLiters(value).ok;
        },
        defaultMessage(args: ValidationArguments) {
          const result = checkLiters(args.value as string | number);
          return result.ok ? '' : result.message;
        },
      },
    });
}

// An optional phone: empty is fine (it clears the field), anything else must be
// a Libyan mobile number.
export const IsOptionalLibyanMobile = (options?: ValidationOptions) =>
  fieldDecorator('isOptionalLibyanMobile', (v) => checkLibyanMobile(v), options);

// An owner's name: an Arabic person name for an individual, a free institution
// name for an institution - decided by the sibling ownerKind.
export const IsOwnerName = (options?: ValidationOptions) =>
  fieldDecorator(
    'isOwnerName',
    (v, args) =>
      (args.object as { ownerKind?: string }).ownerKind === 'INSTITUTION'
        ? checkInstitutionName(v)
        : checkArabicPersonName(v, 'اسم المالك'),
    options,
  );
