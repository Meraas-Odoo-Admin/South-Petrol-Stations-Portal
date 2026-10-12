// Who may do what to whose account (registration pivot, phase 4b; hierarchy
// closed in phase 5A).
//
// Pure functions over plain facts, so every rule is unit-testable and the
// service only has to load the facts. Nothing here looks at a role NAME
// (CLAUDE.md rule 2): the rules are expressed through permissions, a role's
// side (Role.kind), whether a role is municipality-scoped, and the caller's
// own station/office/municipality scope.
//
// THE LEVELS - each level creates and manages only the level directly below it:
//  - ADMIN caller: holds `users:manage` (the super admin). Creates municipality
//    managers (assigned to one municipality), and may create, edit and archive
//    any other account too.
//  - MUNICIPALITY MANAGER caller: holds `users:manage_municipality_staff` but
//    not `users:manage`. Creates, edits and archives the SUPERVISOR-level jobs
//    (jobs that themselves carry `users:manage_staff`: the station supervisor
//    and the registration office manager) of their own municipality - never an
//    account on their own level, above it, or an employee directly.
//  - STAFF MANAGER caller: holds `users:manage_staff` only (the two supervisor
//    jobs). Reaches only the employees of their own stations or offices.
//  A role or account that carries `users:manage_system_admins` is "privileged":
//  only a caller who holds it too may create, edit or promote it.

export type Side = 'PETROL_STATION' | 'REGISTRATION';
/** Where a person works: petrol stations, registration offices, or municipalities. */
export type PlaceKind = Side | 'MUNICIPALITY';

export const PERM_MANAGE = 'users:manage';
export const PERM_MANAGE_STAFF = 'users:manage_staff';
export const PERM_MANAGE_MUNICIPALITY_STAFF = 'users:manage_municipality_staff';
export const PERM_MANAGE_PRIVILEGED = 'users:manage_system_admins';
export const PERM_MANAGE_ROLES = 'roles:manage';

export interface RoleFacts {
  id: string;
  name: string;
  kind: Side | null;
  permissionKeys: readonly string[];
  /** Holders are confined to UserMunicipalityScope (a municipality manager). */
  municipalityScoped?: boolean;
}

export interface ActorFacts {
  id: string;
  /** Effective permissions (roles plus individual grants). */
  permissions: ReadonlySet<string>;
  /** The side of the caller's own job; null for admin jobs. */
  kind: Side | null;
  /** Petrol stations the caller reaches (a municipality manager: all of their municipality's). */
  stationIds: ReadonlySet<string>;
  /** Registration offices the caller reaches (likewise). */
  registrationStationIds: ReadonlySet<string>;
  /** Municipalities the caller is confined to. */
  municipalityIds?: ReadonlySet<string>;
}

export interface TargetFacts {
  id: string;
  roles: readonly RoleFacts[];
  /** Effective permissions of the person being looked at. */
  permissions: ReadonlySet<string>;
  stationIds: readonly string[];
  registrationStationIds: readonly string[];
  municipalityIds?: readonly string[];
}

export type ReadOnlyReason = 'SELF' | 'PRIVILEGED' | 'WORKS_ELSEWHERE';

export interface Capabilities {
  /** May open this person at all. */
  canView: boolean;
  canEditIdentity: boolean;
  canChangeJob: boolean;
  canSetPlaces: boolean;
  /** Deactivate, reactivate, reset password, unlock, archive, restore. */
  canManageAccount: boolean;
  /** Extra individual permissions. */
  canManageAdvanced: boolean;
  /** Why the screen is read-only for this person, when it is. */
  readOnlyReason: ReadOnlyReason | null;
}

const NOTHING: Capabilities = {
  canView: false,
  canEditIdentity: false,
  canChangeJob: false,
  canSetPlaces: false,
  canManageAccount: false,
  canManageAdvanced: false,
  readOnlyReason: null,
};

export function isAdminCaller(actor: ActorFacts): boolean {
  return actor.permissions.has(PERM_MANAGE);
}

export function isMunicipalityManagerCaller(actor: ActorFacts): boolean {
  return !isAdminCaller(actor) && actor.permissions.has(PERM_MANAGE_MUNICIPALITY_STAFF);
}

export function isStaffManagerCaller(actor: ActorFacts): boolean {
  return !isAdminCaller(actor) && !isMunicipalityManagerCaller(actor) && actor.permissions.has(PERM_MANAGE_STAFF);
}

export function roleIsPrivileged(role: RoleFacts): boolean {
  return role.permissionKeys.includes(PERM_MANAGE_PRIVILEGED);
}

/**
 * The jobs a municipality manager may give: a supervisor-level job - one that
 * itself manages staff, sits on a side (petrol stations or offices) and is
 * neither an admin nor a municipality manager. No role names involved.
 */
export function isSupervisorJob(role: RoleFacts): boolean {
  return (
    role.kind !== null &&
    !role.municipalityScoped &&
    role.permissionKeys.includes(PERM_MANAGE_STAFF) &&
    !role.permissionKeys.includes(PERM_MANAGE) &&
    !role.permissionKeys.includes(PERM_MANAGE_MUNICIPALITY_STAFF) &&
    !roleIsPrivileged(role)
  );
}

/**
 * The one job a staff manager may give: an employee job on their own side,
 * i.e. a role of their own side that itself can neither manage staff nor
 * users. No role names involved - a supervisor job fails this because it
 * carries `users:manage_staff`.
 */
export function isEmployeeJobOfSide(role: RoleFacts, side: Side | null): boolean {
  return (
    side !== null &&
    role.kind === side &&
    !role.municipalityScoped &&
    !role.permissionKeys.includes(PERM_MANAGE_STAFF) &&
    !role.permissionKeys.includes(PERM_MANAGE_MUNICIPALITY_STAFF) &&
    !role.permissionKeys.includes(PERM_MANAGE)
  );
}

/** Where holders of this job work: municipalities, a side's places, or nowhere. */
export function placeKindOfRole(role: RoleFacts): PlaceKind | null {
  return role.municipalityScoped ? 'MUNICIPALITY' : role.kind;
}

/** May this caller give this job to somebody (create or change job)? */
export function canAssignRole(actor: ActorFacts, role: RoleFacts): boolean {
  if (isAdminCaller(actor)) {
    return !roleIsPrivileged(role) || actor.permissions.has(PERM_MANAGE_PRIVILEGED);
  }
  if (isMunicipalityManagerCaller(actor)) {
    return isSupervisorJob(role);
  }
  if (isStaffManagerCaller(actor)) {
    return isEmployeeJobOfSide(role, actor.kind);
  }
  return false;
}

export function placeIdsOf(target: TargetFacts, side: PlaceKind): readonly string[] {
  if (side === 'MUNICIPALITY') return target.municipalityIds ?? [];
  return side === 'PETROL_STATION' ? target.stationIds : target.registrationStationIds;
}

function scopeOf(actor: ActorFacts, side: PlaceKind): ReadonlySet<string> {
  if (side === 'MUNICIPALITY') return actor.municipalityIds ?? new Set();
  return side === 'PETROL_STATION' ? actor.stationIds : actor.registrationStationIds;
}

/**
 * May the caller put somebody at exactly these places?
 *  - admin: any place;
 *  - municipality manager: any petrol station / office inside their
 *    municipality, never a municipality (only the super admin assigns those);
 *  - staff manager: places of their own side inside their own scope.
 */
export function placesWithinCallerScope(actor: ActorFacts, side: PlaceKind, placeIds: readonly string[]): boolean {
  if (isAdminCaller(actor)) return true;
  if (side === 'MUNICIPALITY') return false;
  if (isMunicipalityManagerCaller(actor)) {
    const scope = scopeOf(actor, side);
    return placeIds.every((id) => scope.has(id));
  }
  if (!isStaffManagerCaller(actor) || actor.kind !== side) return false;
  const scope = scopeOf(actor, side);
  return placeIds.every((id) => scope.has(id));
}

export function capabilitiesFor(actor: ActorFacts, target: TargetFacts): Capabilities {
  if (actor.id === target.id) {
    // Nobody changes their own job, places, permissions or account state
    // here (no raising your own role; your own password goes through the
    // normal change-password screen). Admins may still fix their own name
    // and phone.
    return {
      ...NOTHING,
      canView: isAdminCaller(actor) || isMunicipalityManagerCaller(actor) || isStaffManagerCaller(actor),
      canEditIdentity: isAdminCaller(actor),
      readOnlyReason: 'SELF',
    };
  }

  if (isAdminCaller(actor)) {
    const targetPrivileged = target.permissions.has(PERM_MANAGE_PRIVILEGED);
    if (targetPrivileged && !actor.permissions.has(PERM_MANAGE_PRIVILEGED)) {
      return { ...NOTHING, canView: true, readOnlyReason: 'PRIVILEGED' };
    }
    return {
      canView: true,
      canEditIdentity: true,
      canChangeJob: true,
      canSetPlaces: true,
      canManageAccount: true,
      canManageAdvanced: actor.permissions.has(PERM_MANAGE_ROLES),
      readOnlyReason: null,
    };
  }

  if (isMunicipalityManagerCaller(actor)) {
    // Only a person whose single job is a supervisor-level job.
    const [job, ...rest] = target.roles;
    if (!job || rest.length > 0 || !isSupervisorJob(job)) return NOTHING;
    if (!job.kind) return NOTHING;

    const places = placeIdsOf(target, job.kind);
    const scope = scopeOf(actor, job.kind);
    const insideCount = places.filter((id) => scope.has(id)).length;
    // No place of theirs inside the caller's municipality: not their person.
    if (insideCount === 0) return NOTHING;
    if (insideCount < places.length) {
      return { ...NOTHING, canView: true, readOnlyReason: 'WORKS_ELSEWHERE' };
    }
    return {
      canView: true,
      canEditIdentity: true,
      canChangeJob: true,
      canSetPlaces: true,
      canManageAccount: true,
      // The manager may adjust this person's individual permissions within
      // the set supervisor-level jobs may hold (checked in the service).
      canManageAdvanced: true,
      readOnlyReason: null,
    };
  }

  if (isStaffManagerCaller(actor) && actor.kind) {
    const side = actor.kind;
    // Only a person whose single job is an employee job on the caller's side.
    const [job, ...rest] = target.roles;
    if (!job || rest.length > 0 || !isEmployeeJobOfSide(job, side)) return NOTHING;

    const places = placeIdsOf(target, side);
    const scope = scopeOf(actor, side);
    const insideCount = places.filter((id) => scope.has(id)).length;
    // No place of theirs is one of the caller's: not the caller's person.
    // (An employee with no place at all is the admins' to assign first.)
    if (insideCount === 0) return NOTHING;
    if (insideCount < places.length) {
      return { ...NOTHING, canView: true, readOnlyReason: 'WORKS_ELSEWHERE' };
    }
    return {
      canView: true,
      canEditIdentity: true,
      canChangeJob: false,
      canSetPlaces: true,
      canManageAccount: true,
      canManageAdvanced: false,
      readOnlyReason: null,
    };
  }

  return NOTHING;
}
