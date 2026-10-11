// Who sees which destination. The side menu, the phone bottom bar, the phone
// menu sheet and the home screen's cards all read THIS list, so a card can
// never appear for someone whose menu does not show it, or the other way
// round (the home screen had no «الإدارة» or «فريق العمل» card while the menu
// did). It only decides what to show; the API still decides what is allowed.

export type HasPermission = (permission: string) => boolean;

export const NAV_ACCESS = {
  home: () => true,
  dashboard: (has: HasPermission) => has('reports:view_all_stations'),
  fillup: (has: HasPermission) => has('fillups:create'),
  // Registering needs both: vehicles:manage to create, and a registration
  // station to do it at.
  registration: (has: HasPermission) => has('vehicles:manage') && has('registration_stations:read'),
  vehicles: (has: HasPermission) => has('vehicles:read'),
  violations: (has: HasPermission) => has('reports:view'),
  changeRequests: (has: HasPermission) => has('vehicles:approve_change'),
  dailyReport: (has: HasPermission) => has('reports:view'),
  // A supervisor's own staff. Admins manage accounts from the admin area.
  staff: (has: HasPermission) => has('users:manage_staff') && !has('users:manage'),
  stations: (has: HasPermission) => has('stations:read'),
  admin: (has: HasPermission) => has('users:manage'),
} as const;

export type NavKey = keyof typeof NAV_ACCESS;
