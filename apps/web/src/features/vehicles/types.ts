// Same reasoning as features/drivers/types.ts — local, not shared-types.
// Matches VehiclesService.findOneDetailed's response (GET /vehicles/:id).
export interface VehiclePlateHistoryEntry {
  id: string;
  plate: string;
  validFrom: string;
  validTo: string | null;
}

export interface VehicleDriverAssociation {
  driverId: string;
  vehicleId: string;
  isPrimary: boolean;
  driver: {
    id: string;
    fullName: string;
    identityType: 'NATIONAL_ID' | 'ADMINISTRATIVE_ID';
    identityNumber: string;
  };
}

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
  owner: { id: string; fullName: string } | null;
  plateHistory: VehiclePlateHistoryEntry[];
  drivers: VehicleDriverAssociation[];
}
