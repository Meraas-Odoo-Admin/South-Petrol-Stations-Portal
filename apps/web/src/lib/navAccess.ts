// Who sees which destination. The side menu, the phone bottom bar, the phone
// menu sheet and the home screen's cards all read THIS list, so a card can
// never appear for someone whose menu does not show it, or the other way
// round (the home screen had no «الإدارة» or «فريق العمل» card while the menu
// did). It only decides what to show; the API still decides what is allowed.

export type HasPermission = (permission: string) => boolean;

export const NAV_ACCESS = {
  home: () => true,
  fillup: (has: HasPermission) => has('fillups:create'),
  // Registering needs both: vehicles:manage to create, and a registration
  // station to do it at.
  registration: (has: HasPermission) => has('vehicles:manage') && has('registration_stations:read'),
  vehicles: (has: HasPermission) => has('vehicles:read'),
  violations: (has: HasPermission) => has('reports:view'),
  changeRequests: (has: HasPermission) => has('vehicles:approve_change'),
  dailyReport: (has: HasPermission) => has('reports:view'),
  // Phase 5B: ONE reports destination. What it shows is each job's own
  // reports; the API decides what each may read. The three 4c monitoring pages
  // (offices, card stock, readiness) became tabs of the office and station pages.
  reports: (has: HasPermission) =>
    has('reports:own_shift') ||
    has('registration_reports:own_day') ||
    has('registration_reports:view') ||
    has('reports:view') ||
    has('reports:municipality') ||
    has('reports:cross_municipality'),
  // Phase 5A: each level has its own place for its own people, never a
  // free-floating users list.
  //  - «إدارة المحطات»: the municipality manager's stations and offices (and
  //    the people inside each);
  //  - «محطتي»: a station supervisor's own station and employees;
  //  - «مكتبي»: a registration office manager's own office and employees;
  //  - «الإدارة»: the super admin's municipalities, settings and audit log.
  manage: (has: HasPermission) => has('stations:create') || has('registration_stations:manage'),
  myStation: (has: HasPermission) =>
    has('users:manage_staff') && has('stations:manage') && !has('stations:create'),
  myOffice: (has: HasPermission) =>
    has('users:manage_staff') && has('registration_desks:manage') && !has('registration_stations:manage'),
  // The plain station list is for people who have no station page of their own.
  stations: (has: HasPermission) =>
    has('stations:read') && !has('stations:create') && !has('users:manage_staff'),
  // Phase 6: the lookup lists (exception types, vehicle types) in one place.
  lists: (has: HasPermission) => has('exception_types:manage') || has('vehicle_types:manage'),
  admin: (has: HasPermission) =>
    has('municipalities:manage') || has('settings:manage') || has('audit:view'),
} as const;

export type NavKey = keyof typeof NAV_ACCESS;

// Every destination of the side menu, the phone bar and the phone sheet. The
// layout builds its items from these paths; keeping them here lets one pure
// function decide which item is current, and a unit test walk the whole list.
export const NAV_PATHS = [
  '/',
  '/fillups/new',
  '/registration',
  '/vehicles',
  '/reports/violations',
  '/vehicles/change-requests',
  '/reports',
  '/reports/daily',
  '/manage',
  '/my-station',
  '/my-office',
  '/stations',
  '/lists',
  '/admin',
] as const;

// Exactly one item is current for an address: the LONGEST item path that is the
// address itself or a parent of it, segment by segment (so «التقارير» is not
// lit on /reports/daily, and /vehicles/change-requests is not «المركبات»).
// «/» is current only on «/». Returns null for an address with no item (such as
// /change-password), never two items.
export function activeNavPath(paths: readonly string[], pathname: string): string | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  let best: string | null = null;
  for (const path of paths) {
    const matches = path === '/' ? clean === '/' : clean === path || clean.startsWith(`${path}/`);
    if (matches && (best === null || path.length > best.length)) best = path;
  }
  return best;
}
