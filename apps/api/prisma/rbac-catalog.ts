// The RBAC catalog and tunable-business-rule defaults — split out of
// seed.ts so bootstrap-prod.ts (a real-production alternative to the demo
// seed) can reuse them without importing seed.ts itself, which would also
// execute seed.ts's own `main()` (unconditional at module load) as a side
// effect and seed demo data. This file has NO side effects — pure data.

export const PERMISSIONS = [
  { key: 'companies:read', description: 'View companies' },
  { key: 'companies:manage', description: 'Create companies (a station needs one)' },
  // Companies are shared across municipalities: editing or archiving one is
  // held only by the super admin (system_admin holds every permission).
  { key: 'companies:update', description: 'Edit or archive a company (shared across municipalities)' },
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
  // Registration pivot, phase 4c: monitoring reports. All three are scoped by
  // the caller's own offices or stations (the admin roles see everything), and
  // registration employees hold none of them.
  {
    key: 'registration_reports:view',
    description: 'View the registration-office monitoring report: cards, vehicles, people and per-employee activity (subject to registration-station scope)',
  },
  {
    key: 'fuel_stock:read',
    description: 'See fuel levels, deliveries and history at the stations in your scope (supervisors, municipality managers)',
  },
  {
    key: 'fuel_stock:read_visible',
    description: 'See the current fuel level per fuel type at your own station, while the supervisor shows stock to employees',
  },
  // After review (19 Oct 2026): the stations' fuel is the municipality
  // manager's to run, from «مراقبة المحطات» — not the station supervisor's,
  // who only sees their own levels. Three levers instead of one
  // (fuel_stock:manage is gone; rbac-sync takes it off every role).
  {
    key: 'fuel_stock:configure',
    description: "Set a station's tank capacities (and the level it starts from) — municipality managers",
  },
  {
    key: 'fuel_stock:deliver',
    description: 'Record fuel deliveries to the stations in your scope, and correct them — municipality managers',
  },
  {
    key: 'fuel_stock:reset',
    description: "Reset a station's fuel level to zero, with a reason — municipality managers",
  },
  { key: 'notifications:read', description: 'Read your own notifications (the bell)' },
  { key: 'notifications:station_events', description: 'Receive station notifications: low or negative stock, overrides, fuel mismatches, lockouts' },
  { key: 'notifications:office_events', description: 'Receive office notifications: corrections waiting, card shortfall, low blank cards, lockouts' },
  {
    key: 'notifications:municipality_events',
    description: 'Receive municipality notifications: stock, resets, card shortfall, overrides, archives, deadline readiness',
  },
  { key: 'notifications:system_events', description: 'Receive system notifications: no manager, rule or setting changes, failed manager logins' },
  { key: 'reports:municipality', description: 'View the municipality-wide reports: stations, fuel reconciliation, registration progress' },
  { key: 'reports:cross_municipality', description: 'View the cross-municipality summary (super admin)' },
  { key: 'reports:own_shift', description: "View your own shift's fill-ups (station employees)" },
  { key: 'registration_reports:own_day', description: "View your own day's registrations, cards and failed prints (registration employees)" },
  { key: 'stations:read', description: 'View stations (subject to station scope)' },
  {
    key: 'stations:manage',
    description:
      "Edit a station (subject to station scope). Without stations:create only the station's fuel types may be changed",
  },
  // Phase 5A: creating and archiving petrol stations belongs to the
  // municipality manager (inside their own municipality) - not to a station
  // supervisor, who only controls their own station.
  {
    key: 'stations:create',
    description: 'Create, archive and restore petrol stations inside your own municipality (municipality managers)',
  },
  // Phase 7: 'registration_desks:manage' (desks and printers of an office) is
  // gone with the desks themselves. rbac-sync.ts takes it off every role; the
  // Permission row is left alone (see there).
  // Phase 5A: the municipality manager's people tool. Creates, edits and
  // archives the supervisor and office-manager accounts of their own
  // municipality - never an account on their own level or above - and may
  // adjust those accounts' individual permissions within the set those jobs
  // may hold. Enforced in UsersAccountsService, not only on the screen.
  {
    key: 'users:manage_municipality_staff',
    description:
      'Create and manage the supervisor and office-manager accounts of your own municipality, and adjust their permissions (municipality managers)',
  },
  // Phase 5A: only the super admin switches fill-up rules on and off.
  {
    key: 'rules:toggle',
    description: 'Switch each fill-up rule on or off (system settings; audited)',
  },
  // Registration pivot, phase 1: stations in a PREPARING municipality are
  // visible only on admin screens. Deliberately separate from
  // stations:manage, which station_supervisor also holds.
  { key: 'users:manage', description: 'Create/update users and station scope' },
  // Registration pivot, phase 4b: a supervisor's own-staff tool. Never
  // reaches beyond the employees of the supervisor's own stations/offices —
  // enforced in UsersService, not only in the screen.
  {
    key: 'users:manage_staff',
    description: 'Create and manage the employee accounts at your own stations or offices (supervisors)',
  },
  // Held only by system_admin (which holds everything). A role or account
  // that carries it can be created, edited and promoted only by someone who
  // holds it too — this is what stops a directorate admin from minting a
  // system admin, without naming any role in code.
  {
    key: 'users:manage_system_admins',
    description: 'Create, edit and promote the highest administrative accounts (system admins only)',
  },
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
  // After review (15 Oct 2026): vehicles:read and stations:read are also what
  // the fill-up screen calls (the plate lookup, the fuels a station sells), so
  // they no longer decide who gets the record screens («السجلات»: «المركبات»
  // with its search tab, and «المحطات»). That is this permission: every role
  // that reads vehicles holds it, except the station employee, whose only job
  // is recording.
  { key: 'records:browse', description: 'Open the record screens: the vehicles list and a vehicle record, and the stations list' },
  { key: 'fillups:create', description: 'Record a fill-up, including one submitted with an exception' },
  // Seeded for role-table completeness (docs/IMPLEMENTATION_PLAN.md §5 lists
  // it against station_supervisor) — no endpoint uses it in M3.
  // FillUpTransaction is append-only, same precedent as no-delete on
  // stations/users/drivers/owners/vehicles and the insert-only audit log.
  // What "editing" a fill-up would even mean (correcting a typo? voiding a
  // bad entry?) isn't specified anywhere in the plan — needs a decision
  // before anything is built against this permission.
  { key: 'fillups:update', description: '(Unused in M3 — see comment above.)' },
  // Round 12: separate from fillups:create — the client wants exception
  // recording to be a right specific employees are given, not everyone who
  // can record a normal fill-up. Also grantable directly to an individual
  // user (see UserPermission) independent of role. A holder of this
  // permission needs no separate approval — their exceptions are
  // auto-approved at creation (see FillUpsService.create).
  { key: 'fillups:record_exception', description: 'Use an exception type to record a fill-up a rule blocked (Phase 6: no approval step; limited per type per station per day)' },
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
    key: 'exception_settings:manage',
    description: 'Set the strict daily-limit switch and the unreasonable-station threshold (global for the super admin, own municipality for its manager)',
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
// After review (19 Oct 2026, least privilege): each job keeps only what its
// screens use. Taken away: fillups:update (nothing uses it); routes:read and
// security_authorities:read (no screen reads those lists since «خط الإعداد»
// went); vehicles:request_change and owners:request_change (the request forms
// went: «تعديل» edits directly, for vehicles:approve_change /
// owners:approve_change); the station supervisor's owners:reveal_identity
// (a station has no need for the owner's full identity number).
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  // After review (Khalil, 15 Oct 2026): a station employee records fill-ups
  // and nothing else — no vehicles or stations screens, reports, stock or
  // notifications. What is left is exactly what the fill-up screen calls.
  station_employee: [
    'stations:read', // the fuels their station sells
    'vehicles:read', // the plate lookup and the vehicle preview
    'cards:scan',
    'fillups:create',
    // A blocked fill-up recorded as an exception, on the same screen.
    'fillups:record_exception',
  ],
  station_supervisor: [
    'companies:read',
    'municipalities:read',
    'vehicle_types:read',
    'stations:read',
    'stations:manage',
    'vehicles:read',
    'records:browse',
    'cards:scan',
    'fillups:create',
    'fillups:record_exception',
    'owners:read',
    'reports:view',
    'users:manage_staff',
    // Their own station's levels and deliveries, read-only (after review,
    // 19 Oct 2026: deliveries and resets are the municipality manager's).
    'fuel_stock:read',
    'notifications:read',
    'notifications:station_events',
  ],
  // Search the registry (to avoid duplicates), register owners and
  // vehicles at their registration station(s), request corrections to
  // already-registered data. No fillups:* of any kind.
  registration_employee: [
    'registration_stations:read',
    'vehicle_types:read',
    'vehicles:read',
    'records:browse',
    'vehicles:manage',
    'owners:read',
    'owners:manage',
    'cards:read',
    'cards:issue',
    'notifications:read',
    'registration_reports:own_day',
  ],
  // Everything a registration employee can do, plus approving those
  // corrections and revealing full owner identity numbers. No fillups:*.
  registration_supervisor: [
    'registration_stations:read',
    'vehicle_types:read',
    'vehicles:read',
    'records:browse',
    'vehicles:manage',
    'owners:read',
    'owners:manage',
    'vehicles:approve_change',
    'owners:approve_change',
    'owners:reveal_identity',
    'cards:read',
    'cards:issue',
    'cards:cancel',
    'users:manage_staff',
    'registration_reports:view',
    'notifications:read',
    'notifications:office_events',
  ],
  // Phase 5A: "مدير البلدية" - the municipality manager. The internal key
  // stays directorate_admin; the role is now scoped to ONE municipality
  // (MUNICIPALITY_SCOPED_ROLES) and no longer holds the system-wide levers:
  // users:manage / roles:manage (a manager makes only the level directly
  // below via users:manage_municipality_staff), settings:manage, audit:view
  // and the global lookups (vehicle types, exception types), which belong to
  // the super admin.
  // After review (19 Oct 2026): supervisory. No fill-up recording (fillups:create,
  // fillups:record_exception, cards:scan) and no registering of vehicles or
  // owners (vehicles:manage, owners:manage) — that is the stations' and the
  // offices' work. Kept: issuing and cancelling cards (the Phase 7 decision),
  // and correcting a vehicle's or owner's identity (vehicles:approve_change,
  // owners:approve_change).
  directorate_admin: [
    'companies:read',
    'companies:manage',
    'municipalities:read',
    'vehicle_types:read',
    'stations:read',
    'stations:manage',
    'stations:create',
    'registration_stations:read',
    'registration_stations:manage',
    'users:manage_municipality_staff',
    'cards:read',
    // Phase 7: the municipality manager issues and prints cards too, in any
    // registration office of their own municipality (the registration-station
    // scope of a municipality-scoped role is its municipality's offices).
    'cards:issue',
    'cards:cancel',
    'reports:view_all_stations',
    'reports:view',
    'owners:read',
    'vehicles:read',
    'records:browse',
    'vehicles:approve_change',
    'owners:approve_change',
    'owners:reveal_identity',
    'registration_reports:view',
    'fuel_stock:read',
    // After review (19 Oct 2026): «مراقبة المحطات» — tank capacities,
    // deliveries and resets of the municipality's stations.
    'fuel_stock:configure',
    'fuel_stock:deliver',
    'fuel_stock:reset',
    'notifications:read',
    'notifications:municipality_events',
    'reports:municipality',
    'exception_types:manage',
    'exception_settings:manage',
  ],
  system_admin: PERMISSIONS.map((p) => p.key),
};

// The only roles that see every station regardless of UserStationScope.
// station_employee/station_supervisor stay at the schema default (false) —
// both are exercised as scoped-to-one-station in the e2e boundary test.
// Also covers registration stations: these roles see every registration
// station regardless of UserRegistrationStationScope.
export const UNRESTRICTED_STATION_ACCESS_ROLES = new Set(['system_admin']);

// Phase 5A: the roles confined to the municipality (or municipalities) listed
// in UserMunicipalityScope. Everything inside those municipalities is theirs
// to reach; nothing outside it is. Set on Role.municipalityScoped by the
// seed/bootstrap sync - code reads that column, never a role name.
export const MUNICIPALITY_SCOPED_ROLES = new Set(['directorate_admin']);

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
  // Phase 5A: every rule the engine applies can be switched on or off by the
  // super admin. All on by default except the owner liters rule. The seed
  // never overwrites a value an admin already set (see seed.ts), and the
  // migration inserts the same defaults with ON CONFLICT DO NOTHING.
  {
    key: 'fillup.rule.vehicle_gap.enabled',
    value: 'true',
    description: 'Rule switch: minimum days between two fill-ups of the same vehicle',
  },
  {
    key: 'fillup.rule.vehicle_weekly.enabled',
    value: 'true',
    description: 'Rule switch: weekly fill-up count per vehicle',
  },
  {
    key: 'fillup.rule.owner_gap.enabled',
    value: 'true',
    description: 'Rule switch: minimum days between two fill-ups of the same owner',
  },
  {
    key: 'fillup.rule.owner_weekly.enabled',
    value: 'true',
    description: 'Rule switch: weekly fill-up count per owner',
  },
  {
    key: 'fillup.rule.owner_liters.enabled',
    value: 'false',
    description: 'Rule switch: weekly liters per owner',
  },
  // Phase 6: exceptions. The strict switch refuses a use past a type's daily limit
  // at a station; the threshold flags a station with too many exceptions in one
  // day. A municipality manager may override either for their municipality.
  {
    key: 'exceptions.strict_limit',
    value: 'false',
    description: 'Refuse an exception use beyond the type daily limit at a station (otherwise it is allowed, flagged and notified)',
  },
  {
    key: 'exceptions.station_daily_threshold',
    value: '20',
    description: 'Exceptions of all types at one station in one day beyond which the station is flagged',
  },
  {
    key: 'stock.low_threshold_liters',
    value: '1000',
    description: 'Low-stock alert: a fuel type at a station below this many liters notifies the supervisor and the municipality managers',
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
  // After review (19 Oct 2026): how many vehicles one owner may have
  // registered. 0 = no limit. Also added by migration
  // 20261019090000_owner_vehicle_limit, so a running database has it.
  {
    key: 'registration.max_vehicles_per_owner',
    value: '0',
    description: 'Max vehicles registered to one owner (by identity); 0 = no limit',
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
