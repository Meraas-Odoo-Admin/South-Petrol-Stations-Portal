// Which cards the home screen puts first, by what the person does all day
// (Phase 6, B2). Every card a person may see is still there; the ones their job
// uses daily come first, in task order, so nothing important is below the fold.

type Has = (permission: string) => boolean;

const PROFILES: Array<{ key: string; matches: (has: Has) => boolean; order: string[] }> = [
  {
    key: 'super-admin',
    matches: (has) => has('municipalities:manage'),
    order: ['/admin', '/reports/violations', '/reports/daily', '/reports'],
  },
  {
    key: 'municipality-manager',
    matches: (has) => has('stations:create'),
    order: ['/manage', '/manage/offices', '/monitoring', '/reports/violations', '/reports/daily', '/admin', '/reports', '/vehicles/change-requests', '/vehicles'],
  },
  {
    key: 'office-manager',
    matches: (has) => has('users:manage_staff') && has('registration_reports:view'),
    order: ['/my-office', '/registration', '/vehicles', '/reports', '/vehicles/change-requests'],
  },
  {
    key: 'station-supervisor',
    matches: (has) => has('users:manage_staff') && has('stations:manage'),
    order: ['/fillups/new', '/reports/violations', '/reports/daily', '/my-station', '/vehicles', '/reports', '/vehicles/change-requests'],
  },
  {
    key: 'registration-employee',
    matches: (has) => has('vehicles:manage') && has('registration_stations:read'),
    order: ['/registration', '/vehicles', '/vehicles/change-requests', '/reports'],
  },
  {
    key: 'station-employee',
    matches: (has) => has('fillups:create'),
    order: ['/fillups/new', '/reports/daily', '/vehicles', '/reports'],
  },
];

export function homeProfile(has: Has): string {
  return PROFILES.find((p) => p.matches(has))?.key ?? 'other';
}

export function orderHomeLinks<T extends { to: string }>(links: T[], has: Has): T[] {
  const order = PROFILES.find((p) => p.matches(has))?.order ?? [];
  const rank = (to: string) => {
    const i = order.indexOf(to);
    return i === -1 ? order.length : i;
  };
  // A stable sort: the links the job does not list keep their original order.
  return links
    .map((link, index) => ({ link, index }))
    .sort((a, b) => rank(a.link.to) - rank(b.link.to) || a.index - b.index)
    .map((x) => x.link);
}
