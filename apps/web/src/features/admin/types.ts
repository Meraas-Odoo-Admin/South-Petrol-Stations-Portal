export interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  unrestrictedStationAccess: boolean;
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
}

export interface ExceptionTypeRow {
  id: string;
  key: string;
  name: string;
  requiresProof: boolean;
  isActive: boolean;
}
