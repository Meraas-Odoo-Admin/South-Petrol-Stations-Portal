// Phase 7: «رقم المرجع / الإثبات» is gone from every form; a logged action is
// referred to by the code the system gives it. The code is read from the
// row's own id, so every row already has one (old rows included), it never
// changes, and nobody types it.
//
//   referenceCode('EXCEPTION', 'cmv8872l2002mwc7t46fcmhbw') -> 'EX-6FCMHBW'
//
// Shown read-only next to its Arabic meaning («رمز المرجع»), in left-to-right
// mono like every other code. Searching by it is not offered (yet).

export type ReferenceKind = 'EXCEPTION' | 'NO_CARD' | 'VEHICLE_CHANGE' | 'OWNER_CHANGE';

const PREFIXES: Record<ReferenceKind, string> = {
  EXCEPTION: 'EX',
  NO_CARD: 'NC',
  VEHICLE_CHANGE: 'VC',
  OWNER_CHANGE: 'OC',
};

const CODE_LENGTH = 7;

export function referenceCode(kind: ReferenceKind, id: string): string {
  return `${PREFIXES[kind]}-${id.slice(-CODE_LENGTH).toUpperCase()}`;
}

export const REFERENCE_CODE_LABEL = 'رمز المرجع';
