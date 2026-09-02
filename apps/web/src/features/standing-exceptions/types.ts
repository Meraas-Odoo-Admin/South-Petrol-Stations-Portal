import type { RuleFailureReason } from '@fuel-tracking/shared-types';

// Matches StandingExceptionsService.findAll's response — local, not
// shared-types, same reasoning as every other feature-local type in this
// codebase (M2 DTOs were never mirrored either). Round 6: re-scoped from
// driverId to ownerId (see docs/DESIGN_owner_based_fillups.md).
export interface StandingExceptionEntry {
  id: string;
  ownerId: string | null;
  owner: { id: string; fullName: string } | null;
  vehicleId: string | null;
  vehicle: { id: string; internalCode: string; currentPlate: string } | null;
  rules: RuleFailureReason[];
  reason: string;
  grantedById: string;
  grantedBy: { id: string; fullName: string; username: string };
  grantedAt: string;
  expiresAt: string | null;
  revokedById: string | null;
  revokedBy: { id: string; fullName: string; username: string } | null;
  revokedAt: string | null;
}

export const STANDING_EXCEPTION_RULES: RuleFailureReason[] = [
  'VEHICLE_GAP_TOO_SHORT',
  'VEHICLE_WEEKLY_CAP_REACHED',
  'OWNER_GAP_TOO_SHORT',
  'OWNER_WEEKLY_CAP_REACHED',
  'LITERS_PER_PERSON_CAP_REACHED',
];
