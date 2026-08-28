// Real-world Libyan identity/vehicle document formats, confirmed by the
// client. Shared by the Driver/Owner/Vehicle DTOs so the regex source of
// truth lives in one place. See docs/OPEN_ITEMS.md if the client later
// narrows/changes any of these.
export const NATIONAL_ID_REGEX = /^[12]\d{11}$/; // 1=male,2=female + 4-digit birth year + 7-digit sequence
export const ADMINISTRATIVE_ID_REGEX = /^9\d{11}$/; // residents/non-nationals/temporary
export const LICENSE_PLATE_REGEX = /^\d{1,2}[-\s]?\d{1,7}$/; // city code + sequence
export const CHASSIS_NUMBER_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/; // ISO 3779 VIN, excludes I/O/Q
// VehicleOwner.nationalId isn't discriminated by a separate identityType
// field like Driver is, so it accepts either shape.
export const NATIONAL_OR_ADMINISTRATIVE_ID_REGEX = /^([12]\d{11}|9\d{11})$/;
export const REGISTRATION_BOOKLET_REGEX = /^[A-Za-z0-9]{6,12}$/;
