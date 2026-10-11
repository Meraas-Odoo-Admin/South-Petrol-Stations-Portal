// Shapes returned by the accounts endpoints (apps/api/src/users). The server
// decides what the caller may do; the screen only reflects `capabilities`.

export type JobKind = 'PETROL_STATION' | 'REGISTRATION' | null;
export type AccountStatus = 'active' | 'deactivated' | 'locked' | 'must_change';

export interface JobOption {
  id: string;
  name: string;
  description: string | null;
  kind: JobKind;
  unrestrictedStationAccess: boolean;
}

export interface UserListItem {
  id: string;
  username: string;
  fullName: string;
  status: AccountStatus;
  lastLoginAt: string | null;
  job: { roleId: string; name: string; kind: JobKind } | null;
  jobCount: number;
  sees: 'ALL' | 'PLACES';
  placeKind: JobKind;
  placeNames: string[];
  placeCount: number;
  canManage: boolean;
}

export interface UserListResponse {
  total: number;
  skip: number;
  take: number;
  items: UserListItem[];
}

export type ReadOnlyReason = 'SELF' | 'PRIVILEGED' | 'WORKS_ELSEWHERE' | null;

export interface Capabilities {
  canView: boolean;
  canEditIdentity: boolean;
  canChangeJob: boolean;
  canSetPlaces: boolean;
  canManageAccount: boolean;
  canManageAdvanced: boolean;
  readOnlyReason: ReadOnlyReason;
}

export interface Place {
  id: string;
  internalCode: string;
  name: string;
}

export interface UserDetail {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  status: AccountStatus;
  roles: Array<{ roleId: string; role: { id: string; name: string; description: string | null; kind: JobKind; unrestrictedStationAccess: boolean } }>;
  directPermissions: Array<{ permissionId: string; permission: { id: string; key: string; description: string | null } }>;
  placeKind: JobKind;
  places: Place[];
  sees: 'ALL' | 'PLACES';
  capabilities: Capabilities;
  assignableJobs: JobOption[];
}

export interface ActivityItem {
  id: string;
  action: string;
  createdAt: string;
  actorName: string | null;
  reason: string | null;
  job: string | null;
}

export interface CreatedUser {
  id: string;
  username: string;
  fullName: string;
  mustChangePassword: boolean;
  temporaryPassword?: string;
}

export interface UsersOptions {
  jobs: JobOption[];
  callerSide: JobKind;
}
