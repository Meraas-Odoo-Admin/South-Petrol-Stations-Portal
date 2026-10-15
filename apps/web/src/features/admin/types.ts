export interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  unrestrictedStationAccess: boolean;
  // Registration pivot, phase 2: which side of the petrol-station /
  // registration split this role is on; null = admin (neither side).
  kind: 'PETROL_STATION' | 'REGISTRATION' | null;
}

export interface AdminUserRegistrationStationScope {
  registrationStationId: string;
  registrationStation: { id: string; internalCode: string; name: string };
}

export interface AdminUserStationScope {
  stationId: string;
  station: { id: string; internalCode: string; name: string };
}

export interface AdminUserRole {
  roleId: string;
  role: AdminRole;
}

// Round 12: a Permission can also be granted directly to one user,
// independent of their roles — see UserPermission's schema comment.
export interface AdminPermission {
  id: string;
  key: string;
  description: string | null;
}

export interface AdminUserPermission {
  permissionId: string;
  permission: AdminPermission;
}

export interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
  roles: AdminUserRole[];
  stationScope: AdminUserStationScope[];
  registrationStationScope: AdminUserRegistrationStationScope[];
  directPermissions: AdminUserPermission[];
}

export interface SystemSettingRow {
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

export interface AuditLogRow {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
  user: { id: string; username: string; fullName: string } | null;
  // After review (15 Oct 2026): where it came from, and what it is about.
  ipAddress: string | null;
  userAgent: string | null;
  // The person, station, vehicle… by name, as it is named now; null when the
  // record is gone or has no name (a fill-up, a session).
  entityLabel: string | null;
}

export interface ExceptionTypeRow {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
}
