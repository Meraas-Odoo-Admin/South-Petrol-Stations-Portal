// Local to this feature, not shared-types — same reasoning as
// features/drivers/types.ts. This is the shape GET /stations actually
// returns that the picker/list screens render.
//
// station-card-field-spec: municipality/route were a free-text string (or,
// for route, didn't exist) — both are now Settings-managed lookup tables,
// included by StationsService as nested { id, name } objects rather than
// bare ids, so a list screen never has to look them up separately.
export interface LookupRef {
  id: string;
  name: string;
}

export type StationOwnershipType = 'GOVERNMENT' | 'PRIVATE';

// Registration pivot, phase 1: a municipality is PREPARING (admin-only,
// no fill-ups) or LIVE, and carries its one security authority — a
// station's authority is read from here, never stored per station.
export type MunicipalityStatus = 'PREPARING' | 'LIVE';

export interface MunicipalityRef extends LookupRef {
  status: MunicipalityStatus;
  // Phase 3: card-number prefix (e.g. SBH); null until an admin sets it.
  code?: string | null;
  securityAuthority: LookupRef | null;
  // Phase 4a: optional Africa/Tripoli calendar days (YYYY-MM-DD) and the
  // stage the server computed from them.
  awarenessStartDate?: string | null;
  cardRequiredFromDate?: string | null;
  stage?: 'GRACE' | 'AWARENESS' | 'CARD_REQUIRED';
}

export interface StationFuelAvailabilityRow {
  fuelType: string;
  isAvailable: boolean;
}

export interface StationBasicInfo {
  id: string;
  internalCode: string;
  stationNumber: string;
  name: string;
  companyId: string;
  municipalityId: string | null;
  municipality: MunicipalityRef | null;
  routeId: string | null;
  route: LookupRef | null;
  status: string;
  statusNote: string | null;
  ownershipType: StationOwnershipType | null;
  supervisorName: string | null;
  supervisorPhone: string | null;
  operatorSameAsSupervisor: boolean;
  operatorName: string | null;
  operatorPhone: string | null;
  fuelAvailability: StationFuelAvailabilityRow[];
}
