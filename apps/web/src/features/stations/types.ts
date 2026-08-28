// Local to this feature, not shared-types — same reasoning as
// features/drivers/types.ts. This is the shape GET /stations actually
// returns that the picker/list screens render.
export interface StationBasicInfo {
  id: string;
  internalCode: string;
  stationNumber: string;
  name: string;
  companyId: string;
  municipality: string | null;
  status: string;
}
