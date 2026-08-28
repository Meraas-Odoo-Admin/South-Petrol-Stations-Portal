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
  driverId?: string;
  fuelType?: FuelType;
}

export interface DailyReportResponse {
  stationId: string | null; // null = all stations combined
  date: string;
  driverId: string | null;
  fuelType: FuelType | null;
  totalFillUps: number;
  totalLiters: number;
  exceptionsPending: number;
  exceptionsApproved: number;
}

// ── GET /reports/violations, /reports/drivers/:id/history,
//    /reports/vehicles/:id/history ───────────────────────────────────────

export interface FillUpVehicleSummary {
  id: string;
  internalCode: string;
  currentPlate: string;
}

// identityNumber is NOT masked by the API — masking is applied client-side
// only, using MeResponse.permissions (see lib/masking.ts). This is the
// UI-only masking rule from docs/IMPLEMENTATION_PLAN.md §8.
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
  driverId: string;
  stationId: string;
  fuelType: FuelType;
  quantityLiters: string;
  occurredAt: string;
  recordedById: string;
  isException: boolean;
  idempotencyKey: string;
  createdAt: string;
  vehicle: FillUpVehicleSummary;
  driver: FillUpDriverSummary;
  station: FillUpStationSummary;
  exception: ExceptionSummary | null;
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

export interface DashboardResponse {
  from: string;
  to: string;
  totalFillUps: number;
  totalLiters: number;
  exceptionRate: number;
  perStation: DashboardStationBreakdown[];
}

// ── Export ────────────────────────────────────────────────────────────────

export type ReportExportFormat = 'xlsx' | 'pdf';
