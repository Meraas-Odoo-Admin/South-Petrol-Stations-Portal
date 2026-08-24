// Same reasoning as features/drivers/types.ts — local, not shared-types.
export interface VehicleBasicInfo {
  id: string;
  internalCode: string;
  currentPlate: string;
  chassisNumber: string | null;
  vehicleType: string | null;
  model: string | null;
  color: string | null;
  manufactureYear: number | null;
  usageType: string | null;
}
