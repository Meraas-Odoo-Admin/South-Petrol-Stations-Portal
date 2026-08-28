import type { RuleFailureReason } from '@fuel-tracking/shared-types';

// Matches StandingExceptionsService.findAll's response — local, not
// shared-types, same reasoning as every other feature-local type in this
// codebase (M2 DTOs were never mirrored either).
export interface StandingExceptionEntry {
  id: string;
  driverId: string | null;
  driver: { id: string; fullName: string } | null;
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
  'DRIVER_GAP_TOO_SHORT',
  'DRIVER_WEEKLY_CAP_REACHED',
  'LITERS_PER_PERSON_CAP_REACHED',
];
