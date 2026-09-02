// Mirrors apps/api/src/reports/dto/*.ts and ReportsService's response
// shapes. Only the shapes this milestone's frontend actually consumes —
// see the note in index.ts about why this isn't a full M1-M4 DTO mirror.

import type { PaginatedResponse, PaginationQuery } from './pagination';

export type FuelType = 'PETROL_95' | 'DIESEL' | 'KEROSENE';
export type IdentityType = 'NATIONAL_ID' | 'ADMINISTRATIVE_ID';

// ── GET /reports/daily ──────────────────────────────────────────────────

export interface DailyReportQuery {
  stationId?: string;
  date?: string; // YYYY-MM-DD
  ownerId?: string;
  fuelType?: FuelType;
}

export interface DailyReportResponse {
  stationId: string | null; // null = all stations combined
  date: string;
  ownerId: string | null;
  fuelType: FuelType | null;
  totalFillUps: number;
  totalLiters: number;
  exceptionsPending: number;
  exceptionsApproved: number;
  // Round 4 feedback item 9: a live "showing X of Y after filters" line and
  // an actual results table, not KPI tiles alone — totalBeforeFilters is
  // the same station+date scope with owner/fuelType filters NOT applied,
  // so the line can say how much the optional filters narrowed the set.
  totalBeforeFilters: number;
  rows: FillUpHistoryEntry[];
}

// ── GET /reports/violations, /reports/drivers/:id/history,
//    /reports/vehicles/:id/history ───────────────────────────────────────

// identityNumber is NOT masked by the API — masking is applied client-side
// only, using MeResponse.permissions (see lib/masking.ts). This is the
// UI-only masking rule from docs/IMPLEMENTATION_PLAN.md §8.
export interface FillUpOwnerSummary {
  id: string;
  identityType: IdentityType;
  identityNumber: string;
  fullName: string;
}

export interface FillUpVehicleSummary {
  id: string;
  internalCode: string;
  currentPlate: string;
  owner: FillUpOwnerSummary | null;
}

// Legacy-only (round 6): null on every fill-up recorded after fill-ups
// stopped requiring driver identity — see
// docs/DESIGN_owner_based_fillups.md. Kept so historical rows still render
// their driver attribution.
export interface FillUpDriverSummary {
  id: string;
  identityType: IdentityType;
  identityNumber: string;
  fullName: string;
}

export interface FillUpStationSummary {
  id: string;
  internalCode: string;
  name: string;
}

export interface ExceptionTypeSummary {
  id: string;
  key: string;
  name: string;
  requiresProof: boolean;
  isActive: boolean;
}

export interface ExceptionSummary {
  id: string;
  exceptionTypeId: string;
  reason: string;
  approvedById: string | null;
  proofReference: string | null;
  validUntil: string | null;
  createdAt: string;
  exceptionType: ExceptionTypeSummary;
  // Diagnostic snapshot captured server-side at submission time (item 8) —
  // which rule the fill-up would have tripped and the specific prior
  // fill-up that triggered it, so the approver sees why this was flagged
  // instead of a bare "submitted as exception". Null for rows created
  // before this field existed, or if the rule engine somehow ran clean.
  triggerReason: string | null;
  triggerDetail: {
    vehicleId: string;
    vehicleInternalCode: string | null;
    vehicleCurrentPlate: string | null;
    occurredAt: string;
  } | null;
}

// A raw FillUpTransaction row as returned by the API — quantityLiters is a
// Prisma Decimal, which serializes to a STRING over JSON (decimal.js's
// toJSON), not a number. Parse before doing arithmetic on it.
export interface FillUpHistoryEntry {
  id: string;
  vehicleId: string;
  driverId: string | null;
  stationId: string;
  fuelType: FuelType;
  quantityLiters: string;
  occurredAt: string;
  recordedById: string;
  isException: boolean;
  idempotencyKey: string;
  createdAt: string;
  vehicle: FillUpVehicleSummary;
  driver: FillUpDriverSummary | null;
  station: FillUpStationSummary;
  exception: ExceptionSummary | null;
  // Set when a standing exception (not a one-time submitted exception)
  // auto-allowed this fill-up — distinct status from a plain compliant
  // row or a one-time exception (round 4 feedback, driver/vehicle detail
  // history tables' per-row status pill).
  standingExceptionId: string | null;
}

export type ViolationStatus = 'pending' | 'approved' | 'all';

export interface ViolationsQuery extends PaginationQuery {
  stationId?: string;
  from?: string;
  to?: string;
  status?: ViolationStatus;
}

// An Exception row with its parent FillUpTransaction nested inside —
// mirrors ReportsService.getViolations exactly (Exception is the root,
// not FillUpTransaction).
export interface ViolationEntry extends ExceptionSummary {
  fillUpTransactionId: string;
  fillUpTransaction: FillUpHistoryEntry;
}

export type ViolationsResponse = PaginatedResponse<ViolationEntry>;

export type HistoryQuery = PaginationQuery;

export type FillUpHistoryResponse = PaginatedResponse<FillUpHistoryEntry>;

// ── GET /reports/dashboard ───────────────────────────────────────────────

export interface DashboardQuery {
  from?: string;
  to?: string;
}

export interface DashboardStationBreakdown {
  stationId: string;
  internalCode: string | null;
  name: string | null;
  totalFillUps: number;
  totalLiters: number;
  exceptionCount: number;
}

export interface DashboardFuelTypeBreakdown {
  fuelType: FuelType;
  totalFillUps: number;
  totalLiters: number;
}

export interface DashboardDailyPoint {
  date: string; // YYYY-MM-DD
  totalFillUps: number;
  totalLiters: number;
  exceptionCount: number;
}

export interface DashboardResponse {
  from: string;
  to: string;
  totalFillUps: number;
  totalLiters: number;
  exceptionRate: number;
  perStation: DashboardStationBreakdown[];
  // Round 4 feedback item 9: chart-backed views, computed from the same
  // filtered range as everything else on this page — never a separate
  // hardcoded number.
  byFuelType: DashboardFuelTypeBreakdown[];
  daily: DashboardDailyPoint[];
}

// ── Export ────────────────────────────────────────────────────────────────

export type ReportExportFormat = 'xlsx' | 'pdf';
