// Local, not shared-types. Matches VehiclesService.findOneDetailed's
// response (GET /vehicles/:id).
export interface VehiclePlateHistoryEntry {
  id: string;
  plate: string;
  validFrom: string;
  validTo: string | null;
}

// Round 6: identityType/identityNumber added — the owner, not a driver,
// now carries the identity number fill-up rules key on (see
// docs/DESIGN_owner_based_fillups.md). `drivers`/`VehicleDriverAssociation`
// removed along with the rest of the Driver management surface.
export interface VehicleBasicInfo {
  id: string;
  internalCode: string;
  currentPlate: string;
  chassisNumber: string | null;
  registrationBooklet: string | null;
  vehicleType: string | null;
  model: string | null;
  color: string | null;
  manufactureYear: number | null;
  usageType: string | null;
  owner: {
    id: string;
    fullName: string;
    identityType: 'NATIONAL_ID' | 'ADMINISTRATIVE_ID';
    identityNumber: string;
  } | null;
  plateHistory: VehiclePlateHistoryEntry[];
}
