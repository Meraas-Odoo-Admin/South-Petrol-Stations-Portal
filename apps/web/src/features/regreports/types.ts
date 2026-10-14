// Shapes returned by the registration report endpoints (apps/api/src/registration-reports).

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

