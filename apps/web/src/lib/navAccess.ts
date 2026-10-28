// Who sees which destination. The side menu, the phone bottom bar, the phone
// menu sheet and the home screen's cards all read THIS list, so a card can
// never appear for someone whose menu does not show it, or the other way
// round (the home screen had no «الإدارة» or «فريق العمل» card while the menu
// did). It only decides what to show; the API still decides what is allowed.

export type HasPermission = (permission: string) => boolean;

// The lookup lists (exception types, vehicle types): who may manage either.
const canManageLists = (has: HasPermission) => has('exception_types:manage') || has('vehicle_types:manage');

export const NAV_ACCESS = {
  home: () => true,
  fillup: (has: HasPermission) => has('fillups:create'),
  // Registering needs both: vehicles:manage to create, and a registration
  // station to do it at.
  registration: (has: HasPermission) => has('vehicles:manage') && has('registration_stations:read'),
  // records:browse, not vehicles:read: the station employee looks vehicles up
  // while recording but has no vehicles screen (after review, 15 Oct 2026).
  vehicles: (has: HasPermission) => has('records:browse'),
  // After review (28 Oct 2026): «الملاك» — the office managers and those above them.
  owners: (has: HasPermission) => has('owners:approve_change'),
  violations: (has: HasPermission) => has('reports:view'),
  // After review (Khalil, 15 Oct 2026): «طلبات التعديل» is hidden from every
  // role — no menu item, home card or bar tab. The screen and its API stay
  // (/vehicles/change-requests, vehicles:approve_change); bring the entry back
  // with \`(has) => has('vehicles:approve_change')\`.
  changeRequests: (_has: HasPermission) => false,
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
  //  - «الإدارة»: the super admin's municipalities, settings and audit log,
  //    and «القوائم» (Phase 7: a tab here, not its own menu item), which a
  //    municipality manager opens too.
  // After review (21 Oct 2026): «إدارة المحطات» and «إدارة مكاتب التسجيل» are
  // two items, each with its places and its supervisors.
  manage: (has: HasPermission) => has('stations:create'),
  manageOffices: (has: HasPermission) => has('registration_stations:manage'),
  // After review (19 Oct 2026): «مراقبة المحطات» — the stations' fuel, for
  // whoever records the deliveries or resets a level (municipality managers).
  monitoring: (has: HasPermission) => has('fuel_stock:deliver') || has('fuel_stock:reset'),
  myStation: (has: HasPermission) =>
    has('users:manage_staff') && has('stations:manage') && !has('stations:create'),
  myOffice: (has: HasPermission) =>
    // Phase 7: told apart by the office's own reports (the desk permission is gone).
    has('users:manage_staff') && has('registration_reports:view') && !has('registration_stations:manage'),
  // The plain station list is for people who have no station page of their own.
  stations: (has: HasPermission) =>
    has('records:browse') && has('stations:read') && !has('stations:create') && !has('users:manage_staff'),
  // Phase 6: the lookup lists (exception types, vehicle types) in one place;
  // Phase 7: the «القوائم» tab of «الإدارة».
  lists: canManageLists,
  admin: (has: HasPermission) =>
    has('municipalities:manage') || has('settings:manage') || has('audit:view') || canManageLists(has),
} as const;

export type NavKey = keyof typeof NAV_ACCESS;

// Where each destination lives («القوائم» is a tab of «الإدارة», not its own).
const DESTINATION_PATHS: Partial<Record<NavKey, string>> = {
  fillup: '/fillups/new',
  registration: '/registration',
  vehicles: '/vehicles',
  owners: '/owners',
  violations: '/reports/violations',
  changeRequests: '/vehicles/change-requests',
  reports: '/reports',
  dailyReport: '/reports/daily',
  manage: '/manage',
  manageOffices: '/manage/offices',
  monitoring: '/monitoring',
  myStation: '/my-station',
  myOffice: '/my-office',
  stations: '/stations',
  admin: '/admin',
};

// Someone with ONE destination besides the home screen (the station employee:
// «تسجيل تعبئة», after review 15 Oct 2026) has no home screen and no menu of
// one item: the app opens straight on that screen. Read from the permissions,
// like everything else here — never from the role's name.
export function singleDestination(has: HasPermission): string | null {
  const paths = (Object.keys(DESTINATION_PATHS) as NavKey[])
    .filter((key) => (NAV_ACCESS[key] as (h: HasPermission) => boolean)(has))
    .map((key) => DESTINATION_PATHS[key]!);
  return paths.length === 1 ? (paths[0] ?? null) : null;
}

// Every destination of the side menu, the phone bar and the phone sheet. The
// layout builds its items from these paths; keeping them here lets one pure
// function decide which item is current, and a unit test walk the whole list.
export const NAV_PATHS = [
  '/',
  '/fillups/new',
  '/registration',
  '/vehicles',
  '/owners',
  '/reports/violations',
  '/vehicles/change-requests',
  '/reports',
  '/reports/daily',
  '/manage',
  '/manage/offices',
  '/monitoring',
  '/my-station',
  '/my-office',
  '/stations',
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
