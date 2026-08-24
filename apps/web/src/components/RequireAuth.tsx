import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';

export function RequireAuth() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // Gates BOTH the initial mount-time refresh AND the post-login/
  // post-changePassword window where a token exists but GET /auth/me
  // hasn't resolved yet — see AuthProvider's isLoading doc comment. Only
  // isInitializing here would redirect a genuinely-valid session straight
  // back to /login every time (confirmed by Playwright — see e2e/).
  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">...جارٍ التحميل</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Blocks navigation to anything else until the forced password change
  // succeeds, per the M4 instructions.
  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}
