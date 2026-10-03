// The RBAC catalog and tunable-business-rule defaults — split out of
// seed.ts so bootstrap-prod.ts (a real-production alternative to the demo
// seed) can reuse them without importing seed.ts itself, which would also
// execute seed.ts's own `main()` (unconditional at module load) as a side
// effect and seed demo data. This file has NO side effects — pure data.

export const PERMISSIONS = [
  { key: 'companies:read', description: 'View companies' },
  { key: 'companies:manage', description: 'Create/update companies' },
  // station-card-field-spec: municipality/route/security-authority are
  // Settings-managed lookup lists, same read/manage split as companies:*.
  { key: 'municipalities:read', description: 'View the municipality list' },
  { key: 'municipalities:manage', description: 'Create/update municipalities' },
  { key: 'routes:read', description: 'View the station route/haulage-line list' },
  { key: 'routes:manage', description: 'Create/update station routes' },
  { key: 'security_authorities:read', description: 'View the security authority list' },
  { key: 'security_authorities:manage', description: 'Create/update security authorities (one per municipality)' },
  // Registration pivot, phase 2: police-station registration desks.
  { key: 'registration_stations:read', description: 'View registration stations (subject to registration-station scope)' },
  { key: 'registration_stations:manage', description: 'Create/update registration stations' },
  // Registration pivot, phase 3: the printed vehicle card.
  { key: 'cards:read', description: "View a vehicle's cards and card history" },
  { key: 'cards:issue', description: 'Issue, print and reprint vehicle cards at a registration station' },
  { key: 'cards:cancel', description: 'Cancel a vehicle card without replacing it' },
  { key: 'cards:scan', description: 'Look up a vehicle by scanning its card at the pump' },
  { key: 'stations:read', description: 'View stations (subject to station scope)' },
  { key: 'stations:manage', description: 'Create/update stations' },
  // Registration pivot, phase 1: stations in a PREPARING municipality are
  // visible only on admin screens. Deliberately separate from
  // stations:manage, which station_supervisor also holds.
  {
    key: 'stations:view_preparing',
    description: 'See stations in municipalities that are still being prepared (not live yet)',
  },
  { key: 'users:manage', description: 'Create/update users and station scope' },
  { key: 'roles:manage', description: 'Assign/remove roles' },
  { key: 'reports:view_all_stations', description: 'View directorate-wide reports' },
  {
    key: 'reports:view',
    description:
      'View per-station reports (daily report, violations list, owner/vehicle history)',
  },
  { key: 'owners:read', description: 'Look up the vehicle owner registry (read-only)' },
  { key: 'owners:manage', description: 'Create/update the vehicle owner registry' },
  { key: 'vehicles:manage', description: 'Create/update vehicles, plate changes' },
  { key: 'vehicles:read', description: 'Look up the vehicle registry (read-only)' },
  { key: 'fillups:create', description: 'Record a fill-up, including one submitted with an exception' },
  // Seeded for role-table completeness (docs/IMPLEMENTATION_PLAN.md §5 lists
  // it against station_supervisor) — no endpoint uses it in M3.
  // FillUpTransaction is append-only, same precedent as no-delete on
  // stations/users/drivers/owners/vehicles and the insert-only audit log.
  // What "editing" a fill-up would even mean (correcting a typo? voiding a
  // bad entry?) isn't specified anywhere in the plan — needs a decision
  // before anything is built against this permission.
  { key: 'fillups:update', description: '(Unused in M3 — see comment above.)' },
  { key: 'fillups:approve_exception', description: 'Approve a requested fill-up exception' },
  // Round 12: separate from fillups:create — the client wants exception
  // recording to be a right specific employees are given, not everyone who
  // can record a normal fill-up. Also grantable directly to an individual
  // user (see UserPermission) independent of role. A holder of this
  // permission needs no separate approval — their exceptions are
  // auto-approved at creation (see FillUpsService.create).
  { key: 'fillups:record_exception', description: 'Record a fill-up as an exception — auto-approved, no separate approval step' },
  {
    key: 'vehicle_types:read',
    description: 'View the vehicle type list',
  },
  {
    key: 'vehicle_types:manage',
    description: 'Create/update vehicle types',
  },
  {
    key: 'vehicles:request_change',
    description:
      'Request a chassisNumber/registrationBooklet change on a vehicle that already has one set (first-time sets need no request — see VehiclesService.setOrRequestChange)',
  },
  {
    key: 'vehicles:approve_change',
    description: 'Approve or reject a pending vehicle chassis/registration-booklet change request',
  },
  { key: 'settings:manage', description: 'View/edit tunable SystemSetting values (admin panel)' },
  { key: 'audit:view', description: 'View the audit log (admin panel)' },
  {
    key: 'exception_types:manage',
    description: 'Create/update fill-up exception categories (admin panel)',
  },
  {
    key: 'standing_exceptions:manage',
    description: 'Grant/revoke a standing (ongoing) rule exemption for a vehicle owner and/or vehicle',
  },
  {
    key: 'owners:reveal_identity',
    description:
      "Reveal a vehicle owner's unmasked national/administrative ID on demand (audited — action REVEAL_NATIONAL_ID). Round 6: replaces drivers:reveal_identity now that the owner, not the driver, carries the identity number that matters for fill-up rules.",
  },
  {
    key: 'owners:request_change',
    description:
      "Request a correction to a vehicle owner's identityType/identityNumber (always requires approval — see OwnersService.requestIdentityChange). A typo'd owner NAME is a direct owners:manage edit, not this — only the identity number/type itself is approval-gated.",
  },
  {
    key: 'owners:approve_change',
    description: 'Approve or reject a pending owner identity change request',
  },
];

// drivers:manage/owners:manage/vehicles:manage follow the same single-tier
// pattern as users:manage (one permission gates read+write) rather than the
// read/manage split used by companies:*/stations:*, since there's no
// station-scoped "read" use case for this registry data yet.
//
// M3 resolves the gap M2 deliberately left open: GET /drivers and
// GET /vehicles now require drivers:read/vehicles:read instead of the
// :manage tier (recording a fill-up needs to look up an existing
// driver/vehicle, not edit the registry). Every role that already held
// :manage is granted the matching :read explicitly — PermissionsGuard
// checks the exact permission string, not a tier hierarchy, so holding
// :manage does not imply :read.
// Registration pivot, phase 2 — two buildings that never share a key: the
// petrol-station roles only read the vehicle registry and record fuel; the
// registration roles only create/correct identities and never touch
// fill-ups. Admins sit above both. ROLE_KINDS below makes the split data,
// and UsersService refuses to give one user a role from each side.
//
// The seed/bootstrap sync (rbac-sync.ts) makes each catalog role's grants
// EXACTLY this list — a permission removed here is removed from existing
// databases too, not just left behind.
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  station_employee: [
    'stations:read',
    // The fill-up screen's plate lookup — read-only, no registration.
    'vehicles:read',
    'vehicle_types:read',
    'cards:scan',
    'fillups:create',
    'fillups:record_exception',
  ],
  station_supervisor: [
    'companies:read',
    'municipalities:read',
    'routes:read',
    'security_authorities:read',
    'vehicle_types:read',
    'stations:read',
    'stations:manage',
    'vehicles:read',
    'cards:scan',
    'fillups:create',
    'fillups:update',
    'fillups:approve_exception',
    'fillups:record_exception',
    'standing_exceptions:manage',
    'owners:read',
    'owners:reveal_identity',
    'reports:view',
  ],
  // Search the registry (to avoid duplicates), register owners and
  // vehicles at their registration station(s), request corrections to
  // already-registered data. No fillups:* of any kind.
  registration_employee: [
    'registration_stations:read',
    'vehicle_types:read',
    'vehicles:read',
    'vehicles:manage',
    'owners:read',
    'owners:manage',
    'vehicles:request_change',
    'owners:request_change',
    'cards:read',
    'cards:issue',
  ],
  // Everything a registration employee can do, plus approving those
  // corrections and revealing full owner identity numbers. No fillups:*.
  registration_supervisor: [
    'registration_stations:read',
    'vehicle_types:read',
    'vehicles:read',
    'vehicles:manage',
    'owners:read',
    'owners:manage',
    'vehicles:request_change',
    'owners:request_change',
    'vehicles:approve_change',
    'owners:approve_change',
    'owners:reveal_identity',
    'cards:read',
    'cards:issue',
    'cards:cancel',
  ],
  directorate_admin: [
    'companies:read',
    'municipalities:read',
    'routes:read',
    'security_authorities:read',
    'vehicle_types:read',
    'vehicle_types:manage',
    'stations:read',
    'stations:manage',
    'stations:view_preparing',
    'registration_stations:read',
    'registration_stations:manage',
    'cards:read',
    'cards:cancel',
    'cards:scan',
    'reports:view_all_stations',
    'reports:view',
    'owners:read',
    'owners:manage',
    'vehicles:manage',
    'vehicles:read',
    'vehicles:request_change',
    'vehicles:approve_change',
    'owners:request_change',
    'owners:approve_change',
    'fillups:create',
    'fillups:update',
    'fillups:approve_exception',
    'fillups:record_exception',
    'standing_exceptions:manage',
    'owners:reveal_identity',
    'settings:manage',
    'audit:view',
    'exception_types:manage',
    'users:manage',
    'roles:manage',
  ],
  system_admin: PERMISSIONS.map((p) => p.key),
};

// The only roles that see every station regardless of UserStationScope.
// station_employee/station_supervisor stay at the schema default (false) —
// both are exercised as scoped-to-one-station in the e2e boundary test.
// Also covers registration stations: these roles see every registration
// station regardless of UserRegistrationStationScope.
export const UNRESTRICTED_STATION_ACCESS_ROLES = new Set(['directorate_admin', 'system_admin']);

// Which side of the split each role is on (Role.kind). Roles not listed
// (the admin roles) are on neither side and may be combined with anything.
export type RoleKindKey = 'PETROL_STATION' | 'REGISTRATION';
export const ROLE_KINDS: Record<string, RoleKindKey> = {
  station_employee: 'PETROL_STATION',
  station_supervisor: 'PETROL_STATION',
  registration_employee: 'REGISTRATION',
  registration_supervisor: 'REGISTRATION',
};

export const SYSTEM_SETTINGS = [
  { key: 'fillup.max_per_week', value: '3', description: 'Max fill-ups per vehicle per week' },
  {
    key: 'fillup.min_gap_days',
    value: '2',
    description: 'Minimum days between two fill-ups for the same vehicle',
  },
  // PLACEHOLDER values (same numbers as the vehicle-level defaults) — the
  // aggregate per-owner cap is a confirmed requirement (docs/OPEN_ITEMS.md:
  // "Multi-vehicle drivers need both a per-vehicle cap and an aggregate
  // per-driver cap", re-confirmed round 6 as per-OWNER instead of
  // per-driver — see docs/DESIGN_owner_based_fillups.md) but the actual
  // numbers, and even whether the two caps should be independent, are NOT
  // confirmed. Change these rows, not code, once the client answers.
  {
    key: 'fillup.max_per_week_per_owner',
    value: '3',
    description: 'PLACEHOLDER — max fill-ups per vehicle owner per week, across all their vehicles',
  },
  {
    key: 'fillup.min_gap_days_per_owner',
    value: '2',
    description: 'PLACEHOLDER — minimum days between two fill-ups for the same vehicle owner, across all their vehicles',
  },
  {
    key: 'fillup.week_window_mode',
    value: 'rolling',
    description: "'rolling' (last 7 days) or 'fixed' (calendar week starting fillup.week_start_day)",
  },
  // Unused while week_window_mode = 'rolling'. Placeholder pending §13's
  // still-open week-start-day question — 6 = Saturday, matching the Libyan
  // work week, but not client-confirmed.
  {
    key: 'fillup.week_start_day',
    value: '6',
    description: 'PLACEHOLDER, unused while week_window_mode=rolling — 0=Sunday..6=Saturday',
  },
  // NEW — not in the original client questionnaire either; a reasonable
  // placeholder like the two owner-level caps above, pending real numbers.
  // Round 6: re-scoped from per-driver to per-owner (docs/OPEN_ITEMS.md #20,
  // docs/DESIGN_owner_based_fillups.md).
  {
    key: 'fillup.max_liters_per_week_per_owner',
    value: '300',
    description:
      'PLACEHOLDER — max total liters a single vehicle owner (by national/administrative ID) can be issued per week, across all their vehicles',
  },
  // Round 4 client feedback: cost = quantityLiters × price-per-liter, shown
  // read-only on the fill-up form. The client gave exactly ONE real number
  // (بنزين 95 at 0.15 LYD/liter) — diesel/kerosene are NOT confirmed and
  // must not be guessed at (see docs/OPEN_ITEMS.md). These two placeholder
  // values are deliberately implausible-looking round numbers, not a
  // considered estimate, so an admin editing settings notices they still
  // need real figures rather than assuming 0.10/0.05 are meaningful.
  {
    key: 'fillup.price_per_liter.PETROL_95',
    value: '0.15',
    description: 'LYD per liter for بنزين 95 — confirmed by the client (round 4 feedback).',
  },
  {
    key: 'fillup.price_per_liter.DIESEL',
    value: '0.10',
    description: 'PLACEHOLDER — not confirmed by the client. Do not treat as a real price.',
  },
  {
    key: 'fillup.price_per_liter.KEROSENE',
    value: '0.05',
    description: 'PLACEHOLDER — not confirmed by the client. Do not treat as a real price.',
  },
];
