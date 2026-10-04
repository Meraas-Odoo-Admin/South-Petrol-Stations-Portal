import { registerDecorator, ValidationOptions } from 'class-validator';
import { normalizePlate } from '@fuel-tracking/shared-types';

// A Libyan plate is a city code (1-2 digits) and a serial number (1-7
// digits) with a separator between them. A plate that can't be split into
// exactly those two parts ("81234567": where does the city code end?) is
// refused — the same rule the shared normalizer defines, so what validates
// here is exactly what can be matched everywhere else.
export function isLibyanPlate(value: unknown): value is string {
  return typeof value === 'string' && normalizePlate(value) !== null;
}

export function IsLibyanPlate(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isLibyanPlate',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a city code (1-2 digits) and a number (1-7 digits) with a separator between them, e.g. "12-3456".`,
        ...options,
      },
      validator: { validate: isLibyanPlate },
    });
}
