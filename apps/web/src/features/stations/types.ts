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
  municipality: LookupRef | null;
  routeId: string | null;
  route: LookupRef | null;
  securityAuthorityId: string | null;
  securityAuthority: LookupRef | null;
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
