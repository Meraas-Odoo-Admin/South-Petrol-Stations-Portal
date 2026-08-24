import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `text-sm ${isActive ? 'font-bold text-white' : 'text-slate-300 hover:text-white'}`;
}

// §9: "Every list/table view ... must respect the logged-in user's role —
// hide, don't just disable" — nav links are gated on the same permissions
// the backend enforces, not shown-then-disabled.
export function Layout() {
  const { user, logout, hasPermission } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-bold">منظومة تتبع تعبئة الوقود</span>
          {hasPermission('reports:view_all_stations') && (
            <NavLink to="/reports/dashboard" className={navLinkClass}>
              لوحة المتابعة
            </NavLink>
          )}
          {hasPermission('reports:view') && (
            <>
              <NavLink to="/reports/daily" className={navLinkClass}>
                التقرير اليومي
              </NavLink>
              <NavLink to="/reports/violations" className={navLinkClass}>
                المخالفات
              </NavLink>
              <NavLink to="/lookup" className={navLinkClass}>
                بحث سائق/مركبة
              </NavLink>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-300">{user?.fullName}</span>
          <NavLink to="/change-password" className="text-sm text-slate-300 hover:text-white">
            تغيير كلمة المرور
          </NavLink>
          <button
            type="button"
            onClick={() => logout()}
            className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600"
          >
            خروج
          </button>
        </div>
      </nav>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}
