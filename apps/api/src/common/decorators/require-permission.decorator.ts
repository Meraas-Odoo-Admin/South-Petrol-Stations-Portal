import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

// Every protected route carries the permission key(s) it requires.
// PermissionsGuard reads this and checks the caller's DB-backed
// permissions — never a hardcoded role name. See CLAUDE.md rule 2.
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
