// Who may do what to whose account (registration pivot, phase 4b).
//
// Pure functions over plain facts, so every rule is unit-testable and the
// service only has to load the facts. Nothing here looks at a role NAME
// (CLAUDE.md rule 2): the rules are expressed through permissions, a role's
// side (Role.kind) and the caller's own station/office scope.
//
//  - An ADMIN caller holds `users:manage` (directorate admin, system admin).
//  - A STAFF MANAGER caller holds `users:manage_staff` but not `users:manage`
//    (the two supervisor jobs). They reach only the employees of their own
//    stations or offices.
//  - A role or account that carries `users:manage_system_admins` is
//    "privileged": only a caller who holds it too may create, edit or promote
//    it. That is how a directorate admin is kept from minting a system admin.

export type Side = 'PETROL_STATION' | 'REGISTRATION';

export const PERM_MANAGE = 'users:manage';
export const PERM_MANAGE_STAFF = 'users:manage_staff';
export const PERM_MANAGE_PRIVILEGED = 'users:manage_system_admins';
export const PERM_MANAGE_ROLES = 'roles:manage';

export interface RoleFacts {
  id: string;
  name: string;
  kind: Side | null;
  permissionKeys: readonly string[];
}

export interface ActorFacts {
  id: string;
  /** Effective permissions (roles plus individual grants). */
  permissions: ReadonlySet<string>;
  /** The side of the caller's own job; null for admin jobs. */
  kind: Side | null;
  stationIds: ReadonlySet<string>;
  registrationStationIds: ReadonlySet<string>;
}

export interface TargetFacts {
  id: string;
  roles: readonly RoleFacts[];
  /** Effective permissions of the person being looked at. */
  permissions: ReadonlySet<string>;
  stationIds: readonly string[];
  registrationStationIds: readonly string[];
}

export type ReadOnlyReason = 'SELF' | 'PRIVILEGED' | 'WORKS_ELSEWHERE';

export interface Capabilities {
  /** May open this person at all. */
  canView: boolean;
  canEditIdentity: boolean;
  canChangeJob: boolean;
  canSetPlaces: boolean;
  /** Deactivate, reactivate, reset password, unlock. */
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

export function isStaffManagerCaller(actor: ActorFacts): boolean {
  return !isAdminCaller(actor) && actor.permissions.has(PERM_MANAGE_STAFF);
}

export function roleIsPrivileged(role: RoleFacts): boolean {
  return role.permissionKeys.includes(PERM_MANAGE_PRIVILEGED);
}

/**
 * The one job a staff manager may give: an employee job on their own side,
 * i.e. a role of their own side that itself can neither manage staff nor
 * users. No role names involved — a supervisor job fails this because it
 * carries `users:manage_staff`.
 */
export function isEmployeeJobOfSide(role: RoleFacts, side: Side | null): boolean {
  return (
    side !== null &&
    role.kind === side &&
    !role.permissionKeys.includes(PERM_MANAGE_STAFF) &&
    !role.permissionKeys.includes(PERM_MANAGE)
  );
}

/** May this caller give this job to somebody (create or change job)? */
export function canAssignRole(actor: ActorFacts, role: RoleFacts): boolean {
  if (isAdminCaller(actor)) {
    return !roleIsPrivileged(role) || actor.permissions.has(PERM_MANAGE_PRIVILEGED);
  }
  if (isStaffManagerCaller(actor)) {
    return isEmployeeJobOfSide(role, actor.kind);
  }
  return false;
}

export function placeIdsOf(target: TargetFacts, side: Side): readonly string[] {
  return side === 'PETROL_STATION' ? target.stationIds : target.registrationStationIds;
}

function scopeOf(actor: ActorFacts, side: Side): ReadonlySet<string> {
  return side === 'PETROL_STATION' ? actor.stationIds : actor.registrationStationIds;
}

/** May a staff manager put somebody at exactly these places? Admins: always. */
export function placesWithinCallerScope(actor: ActorFacts, side: Side, placeIds: readonly string[]): boolean {
  if (isAdminCaller(actor)) return true;
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
      canView: isAdminCaller(actor) || isStaffManagerCaller(actor),
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
