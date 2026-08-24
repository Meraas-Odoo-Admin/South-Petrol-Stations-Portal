// Local to this feature, not shared-types: M2's Driver DTOs are
// deliberately not mirrored into @fuel-tracking/shared-types yet (see the
// note in packages/shared-types/src/index.ts) — this is only the subset
// GET /drivers/:id actually returns that this page renders.
export interface DriverBasicInfo {
  id: string;
  identityType: 'NATIONAL_ID' | 'ADMINISTRATIVE_ID';
  identityNumber: string;
  fullName: string;
  phone: string | null;
}
