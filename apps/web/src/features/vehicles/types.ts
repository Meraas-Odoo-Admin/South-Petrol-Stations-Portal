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
  // Round 12: vehicleType became a Settings-managed lookup (VehicleType),
  // replacing the old free-text field — see VehicleType's schema comment.
  vehicleTypeId: string | null;
  vehicleType: { id: string; name: string } | null;
  make: string | null;
  model: string | null;
  fuelType: 'PETROL' | 'DIESEL' | null;
  chassisNonStandard: boolean;
  color: string | null;
  manufactureYear: number | null;
  usageType: string | null;
  owner: {
    id: string;
    fullName: string;
    identityType: 'NATIONAL_ID' | 'ADMINISTRATIVE_ID' | 'DRIVERS_LICENSE' | 'INSTITUTION';
    ownerKind?: 'INDIVIDUAL' | 'INSTITUTION';
    responsibleDriverName?: string | null;
    responsibleDriverPhone?: string | null;
    identityNumber: string;
    // Round 20: required for new owners — still nullable in the type since
    // owners created before that round have none.
    phone: string | null;
  } | null;
  plateHistory: VehiclePlateHistoryEntry[];
}
