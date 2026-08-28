export interface VehicleChangeRequestEntry {
  id: string;
  vehicleId: string;
  vehicle?: { id: string; internalCode: string; currentPlate: string };
  changeType: 'CHASSIS_CHANGE' | 'BOOKLET_CHANGE';
  currentValue: string;
  requestedValue: string;
  reason: string;
  proofReference: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedById: string;
  decidedById: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}
