// Mirrors apps/api/src/auth/dto/*.ts and AuthService/AuthController's
// response shapes.

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  mustChangePassword: boolean;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  accessToken: string;
}

export interface MeStationScope {
  stationId: string;
  internalCode: string;
  name: string;
}

// GET /auth/me — the frontend's one source of truth for current user +
// permissions (they otherwise only ever exist server-side, checked
// per-request by PermissionsGuard).
export interface MeResponse {
  id: string;
  username: string;
  fullName: string;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
  stationScope: MeStationScope[];
  // Registration pivot, phase 2: the registration stations this user is
  // scoped to (registration employees/supervisors). Same shape.
  registrationStationScope: MeRegistrationStationScope[];
}

export interface MeRegistrationStationScope {
  registrationStationId: string;
  internalCode: string;
  name: string;
}
