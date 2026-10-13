// Shapes returned by the phase 4c report endpoints (apps/api/src/registration-reports,
// card-stock and readiness).

export interface OfficeReport {
  id: string;
  name: string;
  internalCode: string;
  status: string;
  municipality: string;
  cards: {
    issued: number;
    first: number;
    replacements: { lost: number; damaged: number; detailsChanged: number; total: number };
    failedPrintReprints: number;
    wastedCards: number;
    active: number;
    cancelled: number;
    replaced: number;
  };
  vehicles: {
    registered: number;
    duplicatesCaught: number;
    corrections: { requested: number; pending: number; approved: number; rejected: number };
  };
  people: {
    total: number;
    active: number;
    deactivated: number;
    byJob: Array<{ name: string; active: number; deactivated: number }>;
    lastLoginAt: string | null;
  };
}

export interface OfficesResponse {
  range: { from: string; to: string };
  duplicatesRecordedSince: string | null;
  offices: OfficeReport[];
}

export interface EmployeeRow {
  id: string;
  username: string;
  fullName: string;
  job: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  vehiclesRegistered: number;
  cardsIssued: number;
  reprints: number;
  failedPrints: number;
  testPrints: number;
  correctionsRequested: number;
}

export interface EmployeesResponse {
  range: { from: string; to: string };
  office: { id: string; name: string };
  employees: EmployeeRow[];
}

export interface ActivityResponse {
  range: { from: string; to: string };
  employee: {
    id: string;
    username: string;
    fullName: string;
    isActive: boolean;
    lastLoginAt: string | null;
    offices: Array<{ id: string; name: string }>;
  };
  total: number;
  rows: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    detail: Record<string, unknown> | null;
  }>;
}

// ── card stock ──────────────────────────────────────────────────────

export type WindowStatus = 'OK' | 'UNACCOUNTED' | 'NEGATIVE';

export interface StockEffectiveEntry {
  id: string;
  kind: 'RECEIVED' | 'COUNT';
  quantity: number;
  originalQuantity: number;
  corrected: boolean;
  at: string;
}

export interface StockWindow {
  from: StockEffectiveEntry;
  to: StockEffectiveEntry;
  received: number;
  used: number;
  prints: { card: number; test: number; total: number };
  difference: number;
  status: WindowStatus;
}

export interface StockPool {
  registrationStation: { id: string; name: string; internalCode: string };
  desk: { id: string; name: string } | null;
  entryCount: number;
  windows: StockWindow[];
  sinceLastCount: {
    lastCount: StockEffectiveEntry;
    receivedSince: number;
    prints: { card: number; test: number; total: number };
    expectedRemaining: number;
  } | null;
  totals: { unaccountedCards: number; unaccountedWindows: number; negativeWindows: number };
}

export interface ReconciliationResponse {
  range: { from: string; to: string };
  pools: StockPool[];
}

export interface StockEntryRow {
  id: string;
  kind: 'RECEIVED' | 'COUNT';
  registrationStation: { id: string; name: string; internalCode: string };
  desk: { id: string; name: string } | null;
  occurredAt: string;
  createdAt: string;
  createdBy: { id: string; fullName: string };
  note: string | null;
  originalQuantity: number;
  quantity: number;
  corrected: boolean;
  corrections: Array<{ id: string; quantity: number; reason: string | null; createdAt: string; createdBy: { id: string; fullName: string } }>;
}

export interface EntriesResponse {
  range: { from: string; to: string };
  total?: number;
  entries: StockEntryRow[];
}

// ── readiness ───────────────────────────────────────────────────────

export type ReadinessVerdict = 'NONE_REMAINING' | 'NO_ISSUANCE' | 'NO_DEADLINE' | 'DEADLINE_PASSED' | 'ON_TRACK' | 'AT_RISK';

export interface ReadinessHeadline {
  windowFrom: string;
  windowTo: string;
  deadline: string | null;
  today: string;
  cardlessPlates: number;
  windowDays: number;
  averagePerDay: number;
  daysNeeded: number | null;
  daysLeft: number | null;
  shortfall: number | null;
  verdict: ReadinessVerdict;
}

export interface ReadinessDay {
  day: string;
  withCard: number;
  withoutCard: number;
  typedRegistered: number;
  typedUnregistered: number;
  emergencyOverride: number;
  distinctCardlessPlates: number;
  cardsIssued: number;
  firstCardsIssued: number;
}

export interface ReadinessResponse {
  municipality: { id: string; name: string; status: string; awarenessStartDate: string | null; cardRequiredFromDate: string | null };
  municipalities: Array<{ id: string; name: string }>;
  range: { from: string; to: string };
  days: number;
  sees: { stations: 'all' | 'own' | 'none'; offices: 'all' | 'own' | 'none'; headline: boolean };
  headline: ReadinessHeadline | null;
  approximateRows: number;
  approximateBefore: string | null;
  daily: ReadinessDay[];
  stations: Array<{
    id: string;
    name: string;
    internalCode: string;
    withCard: number;
    typedRegistered: number;
    typedUnregistered: number;
    emergencyOverride: number;
    withoutCard: number;
    distinctCardlessPlates: number;
  }>;
  offices: Array<{
    id: string;
    name: string;
    internalCode: string;
    cardsIssued: number;
    firstCardsIssued: number;
    daily: Array<{ day: string; issued: number }>;
  }>;
}
