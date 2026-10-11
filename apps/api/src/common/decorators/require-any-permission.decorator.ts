import { SetMetadata, applyDecorators } from '@nestjs/common';
import { PERMISSIONS_KEY } from './require-permission.decorator';

export const ANY_PERMISSIONS_KEY = 'any_permissions';

// Like @RequirePermission, but the caller needs AT LEAST ONE of the listed
// permissions instead of all of them. For routes with two kinds of caller
// (e.g. an admin and a supervisor) where the service then decides what each
// may do to the specific record. The service must still enforce that — this
// only opens the door.
//
// Also sets an empty required list so PermissionsGuard's "missing marker"
// check passes; the any-of check runs in the guard.
export const RequireAnyPermission = (...permissions: string[]) =>
  applyDecorators(SetMetadata(PERMISSIONS_KEY, []), SetMetadata(ANY_PERMISSIONS_KEY, permissions));
