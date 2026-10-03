import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';

// Marks a route as reachable by a user whose mustChangePassword flag is
// still true. Everything else 403s for such a user — the client-side
// redirect to the change-password screen was previously the only control
// (RequireAuth.tsx), and a still-valid access token could call any other
// authenticated endpoint directly. Only auth/change-password (the escape
// hatch itself), auth/logout, and auth/me (the frontend's own session
// check, needed to render the change-password screen at all) carry this.
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);
