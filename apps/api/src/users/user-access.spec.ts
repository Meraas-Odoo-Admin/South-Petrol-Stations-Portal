import {
  ActorFacts,
  PERM_MANAGE,
  PERM_MANAGE_PRIVILEGED,
  PERM_MANAGE_ROLES,
  PERM_MANAGE_STAFF,
  RoleFacts,
  TargetFacts,
  canAssignRole,
  capabilitiesFor,
  isEmployeeJobOfSide,
  placesWithinCallerScope,
} from './user-access';

// Roles are built from permissions and a side, the same way the catalog
// defines them — the rules never look at a name.
const fuelEmployee: RoleFacts = { id: 'r1', name: 'a', kind: 'PETROL_STATION', permissionKeys: ['fillups:create'] };
const fuelSupervisor: RoleFacts = {
  id: 'r2',
  name: 'b',
  kind: 'PETROL_STATION',
  permissionKeys: ['fillups:create', PERM_MANAGE_STAFF],
};
const regEmployee: RoleFacts = { id: 'r3', name: 'c', kind: 'REGISTRATION', permissionKeys: ['cards:issue'] };
const directorateAdmin: RoleFacts = {
  id: 'r4',
  name: 'd',
  kind: null,
  permissionKeys: [PERM_MANAGE, PERM_MANAGE_ROLES],
};
const topAdmin: RoleFacts = {
  id: 'r5',
  name: 'e',
  kind: null,
  permissionKeys: [PERM_MANAGE, PERM_MANAGE_ROLES, PERM_MANAGE_PRIVILEGED],
};

const set = (...xs: string[]) => new Set(xs);

const admin: ActorFacts = {
  id: 'admin',
  permissions: set(PERM_MANAGE, PERM_MANAGE_ROLES),
  kind: null,
  stationIds: set(),
  registrationStationIds: set(),
};
const top: ActorFacts = { ...admin, id: 'top', permissions: set(PERM_MANAGE, PERM_MANAGE_ROLES, PERM_MANAGE_PRIVILEGED) };
const supervisor: ActorFacts = {
  id: 'sup',
  permissions: set(PERM_MANAGE_STAFF, 'fillups:create'),
  kind: 'PETROL_STATION',
  stationIds: set('s1', 's2'),
  registrationStationIds: set(),
};

const person = (over: Partial<TargetFacts> = {}): TargetFacts => ({
  id: 'p',
  roles: [fuelEmployee],
  permissions: set('fillups:create'),
  stationIds: ['s1'],
  registrationStationIds: [],
  ...over,
});

describe('which jobs a caller may give', () => {
  it('an admin gives any job except a top-level one, which only a top-level caller may give', () => {
    expect(canAssignRole(admin, fuelEmployee)).toBe(true);
    expect(canAssignRole(admin, directorateAdmin)).toBe(true);
    expect(canAssignRole(admin, topAdmin)).toBe(false);
    expect(canAssignRole(top, topAdmin)).toBe(true);
  });

  it("a supervisor gives only their own side's employee job", () => {
    expect(canAssignRole(supervisor, fuelEmployee)).toBe(true);
    expect(canAssignRole(supervisor, fuelSupervisor)).toBe(false);
    expect(canAssignRole(supervisor, regEmployee)).toBe(false);
    expect(canAssignRole(supervisor, directorateAdmin)).toBe(false);
    expect(canAssignRole(supervisor, topAdmin)).toBe(false);
  });

  it('a caller with neither permission gives nothing', () => {
    const nobody: ActorFacts = { ...supervisor, permissions: set('fillups:create') };
    expect(canAssignRole(nobody, fuelEmployee)).toBe(false);
  });

  it('an employee job is recognised by what it carries, not by its name', () => {
    expect(isEmployeeJobOfSide(fuelEmployee, 'PETROL_STATION')).toBe(true);
    expect(isEmployeeJobOfSide(fuelSupervisor, 'PETROL_STATION')).toBe(false);
    expect(isEmployeeJobOfSide(fuelEmployee, 'REGISTRATION')).toBe(false);
    expect(isEmployeeJobOfSide(fuelEmployee, null)).toBe(false);
  });
});

describe('what an admin may do to a person', () => {
  it('everything, for an ordinary person', () => {
    const caps = capabilitiesFor(admin, person());
    expect(caps).toMatchObject({
      canView: true,
      canEditIdentity: true,
      canChangeJob: true,
      canSetPlaces: true,
      canManageAccount: true,
      canManageAdvanced: true,
      readOnlyReason: null,
    });
  });

  it('extra permissions are theirs to manage only with the roles permission', () => {
    const noRoles: ActorFacts = { ...admin, permissions: set(PERM_MANAGE) };
    expect(capabilitiesFor(noRoles, person()).canManageAdvanced).toBe(false);
  });

  it('only read a top-level account, unless the caller is top-level too', () => {
    const topPerson = person({ roles: [topAdmin], permissions: set(PERM_MANAGE_PRIVILEGED) });
    expect(capabilitiesFor(admin, topPerson)).toMatchObject({
      canView: true,
      canChangeJob: false,
      canManageAccount: false,
      readOnlyReason: 'PRIVILEGED',
    });
    expect(capabilitiesFor(top, topPerson).canManageAccount).toBe(true);
  });

  it('may not act on their own account, except the name and phone', () => {
    const caps = capabilitiesFor(admin, person({ id: 'admin' }));
    expect(caps).toMatchObject({
      canView: true,
      canEditIdentity: true,
      canChangeJob: false,
      canSetPlaces: false,
      canManageAccount: false,
      canManageAdvanced: false,
      readOnlyReason: 'SELF',
    });
  });
});

describe('what a supervisor may do to a person', () => {
  it('everything account-related for an employee wholly inside their scope, but never the job', () => {
    expect(capabilitiesFor(supervisor, person({ stationIds: ['s1', 's2'] }))).toMatchObject({
      canView: true,
      canEditIdentity: true,
      canSetPlaces: true,
      canManageAccount: true,
      canChangeJob: false,
      canManageAdvanced: false,
      readOnlyReason: null,
    });
  });

  it('read-only for an employee who also works outside their scope', () => {
    expect(capabilitiesFor(supervisor, person({ stationIds: ['s1', 's9'] }))).toMatchObject({
      canView: true,
      canEditIdentity: false,
      canSetPlaces: false,
      canManageAccount: false,
      readOnlyReason: 'WORKS_ELSEWHERE',
    });
  });

  it('cannot even open an employee entirely outside their scope', () => {
    expect(capabilitiesFor(supervisor, person({ stationIds: ['s9'] })).canView).toBe(false);
  });

  it('cannot open an employee with no place at all', () => {
    expect(capabilitiesFor(supervisor, person({ stationIds: [] })).canView).toBe(false);
  });

  it('cannot open another supervisor, an admin, or the other side', () => {
    expect(capabilitiesFor(supervisor, person({ roles: [fuelSupervisor] })).canView).toBe(false);
    expect(capabilitiesFor(supervisor, person({ roles: [directorateAdmin] })).canView).toBe(false);
    expect(capabilitiesFor(supervisor, person({ roles: [regEmployee], stationIds: [], registrationStationIds: ['r1'] })).canView).toBe(false);
  });

  it('cannot open someone holding more than one job', () => {
    expect(capabilitiesFor(supervisor, person({ roles: [fuelEmployee, regEmployee] })).canView).toBe(false);
  });

  it('cannot act on their own account', () => {
    const caps = capabilitiesFor(supervisor, person({ id: 'sup' }));
    expect(caps.canManageAccount).toBe(false);
    expect(caps.canEditIdentity).toBe(false);
    expect(caps.readOnlyReason).toBe('SELF');
  });
});

describe('which places a caller may assign', () => {
  it('a supervisor only their own; an admin any', () => {
    expect(placesWithinCallerScope(supervisor, 'PETROL_STATION', ['s1', 's2'])).toBe(true);
    expect(placesWithinCallerScope(supervisor, 'PETROL_STATION', ['s1', 's9'])).toBe(false);
    expect(placesWithinCallerScope(supervisor, 'REGISTRATION', ['s1'])).toBe(false);
    expect(placesWithinCallerScope(admin, 'REGISTRATION', ['anything'])).toBe(true);
  });
});
