// Mirrors apps/api/src/fillups/dto/create-fillup.dto.ts,
// apps/api/src/fillups/rule-engine/types.ts, and FillUpsService's response
// shapes — added now that the frontend actually consumes this module (the
// fill-up recording screen), per the policy note in index.ts.
//
// Round 6: fill-ups no longer carry driver identity — rule checks and
// history are scoped to the vehicle's owner instead (see
// docs/DESIGN_owner_based_fillups.md). DRIVER_*/driverId renamed to
// OWNER_*/no explicit ownerId field (the server derives it from the
// vehicle, the client never submits it).

import type { FuelType } from './reports';

export type RuleFailureReason =
  | 'VEHICLE_GAP_TOO_SHORT'
  | 'VEHICLE_WEEKLY_CAP_REACHED'
  | 'OWNER_GAP_TOO_SHORT'
  | 'OWNER_WEEKLY_CAP_REACHED'
  | 'LITERS_PER_PERSON_CAP_REACHED';

// Phase 4a: how a fill-up identified its vehicle. Set by the server only.
export type FillUpIdentification =
  | 'CARD_SCAN'
  | 'TYPED_REGISTERED'
  | 'TYPED_UNREGISTERED'
  | 'EMERGENCY_OVERRIDE';

export type MunicipalityStage = 'GRACE' | 'AWARENESS' | 'CARD_REQUIRED';

export interface RegistrationStationInfo {
  id: string;
  name: string;
  address: string | null;
  workingHours: string | null;
  contactPhone: string | null;
}

// Shown on the success screen after a no-card-scan fill-up in the awareness stage.
export interface AwarenessNotice {
  cardRequiredFromDate: string;
  registrationStations: RegistrationStationInfo[];
}

export interface CreateFillUpRequest {
  // One of vehicleId / cardNumber / plate identifies the vehicle (the server
  // resolves them in that order: card, vehicle, typed plate).
  vehicleId?: string;
  cardNumber?: string;
  plate?: string;
  // Waives only the card requirement after the deadline. Needs the
  // fillups:emergency_override permission and a written reason.
  emergencyOverride?: boolean;
  overrideReason?: string;
  stationId: string;
  fuelType: FuelType;
  quantityLiters: number;
  occurredAt?: string;
  // Presence of ANY of these three puts the request in "exception mode" —
  // see CreateFillUpDto's comment. All three or none.
  exceptionTypeId?: string;
  reason?: string;
  proofReference?: string;
}

// GET /fillups/exception-types — same shape as reports.ts's
// ExceptionTypeSummary (kept as its own export here so this module doesn't
// have to import from reports.ts for something conceptually its own).
export interface ExceptionTypeOption {
  id: string;
  key: string;
  name: string;
  requiresProof: boolean;
  isActive: boolean;
}

// The specific prior fill-up that tripped an OWNER_*/LITERS_* check (a
// gap/liters check can fire because of a fill-up on a DIFFERENT vehicle
// than the one being submitted — this names it instead of leaving the
// tester to guess). null for a weekly-cap violation (no single triggering
// row — it's an aggregate count) or when the rule engine ran clean.
export interface RuleTriggerDetail {
  vehicleId: string | null;
  vehicleInternalCode: string | null;
  vehicleCurrentPlate: string | null;
  occurredAt: string;
}

// The raw Exception row as POST /fillups returns it — include: { exception:
// true } only, no nested exceptionType object (unlike reports.ts's
// ExceptionSummary, which the reports endpoints build with a deeper
// include). Don't confuse the two.
export interface FillUpExceptionRaw {
  id: string;
  fillUpTransactionId: string;
  exceptionTypeId: string;
  reason: string;
  approvedById: string | null;
  proofReference: string | null;
  validUntil: string | null;
  createdAt: string;
  triggerReason: RuleFailureReason | null;
  triggerDetail: RuleTriggerDetail | null;
}

// The raw FillUpTransaction row as POST /fillups returns it — flat
// vehicleId/stationId, no nested summaries (unlike
// reports.ts's FillUpHistoryEntry, which the reports endpoints build with
// a deeper include). driverId is legacy-only (null on every fill-up
// recorded after round 6) — kept in the raw shape only because historical
// rows still carry it.
export interface FillUpTransactionRaw {
  id: string;
  // Null for a fill-up recorded against an unregistered plate (Phase 4a)
  // until the vehicle is registered and the row is linked.
  vehicleId: string | null;
  typedPlate: string | null;
  normalizedPlate: string | null;
  identifiedBy: FillUpIdentification;
  overrideReason: string | null;
  driverId: string | null;
  stationId: string;
  // The municipality the fill-up happened in, stamped at creation from
  // the station and never updated. Null only on legacy rows at stations
  // that had no municipality.
  municipalityId: string | null;
  fuelType: FuelType;
  quantityLiters: string;
  occurredAt: string;
  recordedById: string;
  isException: boolean;
  standingExceptionId: string | null;
  coveredRule: RuleFailureReason | null;
  idempotencyKey: string;
  createdAt: string;
  exception: FillUpExceptionRaw | null;
}

export type FillUpTransactionWithAwareness = FillUpTransactionRaw & { awareness: AwarenessNotice | null };

export type CreateFillUpResult =
  | { allowed: false; reason: RuleFailureReason; trigger: RuleTriggerDetail | null; requiresException: true }
  | FillUpTransactionWithAwareness;

// GET /fillups/rule-preview?vehicleId=X&stationId=Y — round 7 item 1's pre-submit
// rule-review breakdown. `actual: null` means there's no prior history to
// compare against (the check trivially passes). Computed by the same
// FillUpRuleEngine a real submission uses — never a separate client-side
// estimate.
export interface RuleCheckDetail {
  reason: RuleFailureReason;
  passed: boolean;
  actual: number | null;
  limit: number;
}

export interface RulePreviewResponse {
  checks: RuleCheckDetail[];
  // Owner-level rules that cannot be evaluated for an unregistered plate
  // (there is no owner yet). Empty for a registered vehicle.
  skippedRules: RuleFailureReason[];
  identifiedBy: FillUpIdentification;
  registered: boolean;
  stage: MunicipalityStage;
  cardRequiredFromDate: string | null;
  vehicleId: string | null;
  plate: string | null;
}
