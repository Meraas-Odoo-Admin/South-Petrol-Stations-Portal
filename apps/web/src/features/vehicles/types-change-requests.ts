export interface VehicleChangeRequestEntry {
  id: string;
  vehicleId: string;
  vehicle?: { id: string; internalCode: string; currentPlate: string };
  changeType: 'CHASSIS_CHANGE' | 'BOOKLET_CHANGE' | 'OWNER_CHANGE' | 'PLATE_CHANGE' | 'VEHICLE_TYPE_CHANGE';
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

// Round 20: matches GET /owners/change-requests — a distinct shape from
// VehicleChangeRequestEntry (identityType+identityNumber change together,
// not a single current/requested string), so it's a parallel type rather
// than being forced into the same one.
export interface OwnerChangeRequestEntry {
  id: string;
  ownerId: string;
  owner?: { id: string; fullName: string };
  currentIdentityType: 'NATIONAL_ID' | 'ADMINISTRATIVE_ID' | 'DRIVERS_LICENSE';
  currentIdentityNumber: string;
  requestedIdentityType: 'NATIONAL_ID' | 'ADMINISTRATIVE_ID' | 'DRIVERS_LICENSE';
  requestedIdentityNumber: string;
  reason: string;
  proofReference: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedById: string;
  decidedById: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}
