import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks a route as intentionally requiring no auth/permission check.
// Per docs/IMPLEMENTATION_PLAN.md §8, every route must carry either this
// or @RequirePermission (added in M1 alongside the guard that reads it).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
