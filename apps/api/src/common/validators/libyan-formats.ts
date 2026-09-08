// Real-world Libyan identity/vehicle document formats, confirmed by the
// client. Shared by the Driver/Owner/Vehicle DTOs so the regex source of
// truth lives in one place. See docs/OPEN_ITEMS.md if the client later
// narrows/changes any of these.
export const NATIONAL_ID_REGEX = /^[12]\d{11}$/; // 1=male,2=female + 4-digit birth year + 7-digit sequence
export const ADMINISTRATIVE_ID_REGEX = /^9\d{11}$/; // residents/non-nationals/temporary
// Round 11 item 1: no standard Libyan driver's-license number format
// turned up in research (only plate formats and application-process pages
// did) — deliberately permissive rather than invented, per
// docs/OPEN_ITEMS.md. Revisit once the client confirms the real format.
export const DRIVERS_LICENSE_REGEX = /^[A-Za-z0-9]{4,20}$/;
export const LICENSE_PLATE_REGEX = /^\d{1,2}[-\s]?\d{1,7}$/; // city code + sequence
export const CHASSIS_NUMBER_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/; // ISO 3779 VIN, excludes I/O/Q
// VehicleOwner.nationalId isn't discriminated by a separate identityType
// field like Driver is, so it accepts either shape.
export const NATIONAL_OR_ADMINISTRATIVE_ID_REGEX = /^([12]\d{11}|9\d{11})$/;
export const REGISTRATION_BOOKLET_REGEX = /^[A-Za-z0-9]{6,12}$/;
// Round 20: the client wants owner phone numbers required going forward
// specifically because the WhatsApp-share button now opens a chat with
// this number directly — it needs to at least be shaped like a real
// Libyan mobile line (09[1-9]xxxxxxx locally, or +218/00218 + the same 9
// digits without the leading 0). This cannot actually confirm the number
// has WhatsApp installed — that's a real-world fact no format check can
// verify — the UI copy says so explicitly rather than implying this
// regex guarantees it.
export const LIBYAN_MOBILE_REGEX = /^(?:\+?218)?0?9\d{8}$/;
