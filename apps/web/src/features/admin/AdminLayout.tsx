import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

function tabClass({ isActive }: { isActive: boolean }): string {
  return `flex h-[34px] items-center rounded-full px-3.5 text-[12px] font-bold transition ${
    isActive ? 'bg-primary text-white' : 'text-ink-soft hover:bg-surface-alt'
  }`;
}

// Item 7 — matches design/Fuel Control System - Design Directions.dc.html
// turn 2i (Administration): a white header row (shadow-sm) with the page
// title/subtitle on one side and the section tabs as inline pills on the
// other — not a separate tab bar below the title, and not a bordered
// table page. 2i only mocks 3 sections (Accounts/Settings/Audit log);
// Exception Types and Stations are extensions per design-system-notes.md's
// explicit instruction to apply the same system to unmocked screens.
export function AdminLayout() {
  const { hasPermission } = useAuth();

  return (
    <div className="-m-4 min-h-[calc(100vh-56px)] bg-paper">
      <div className="flex flex-wrap items-end justify-between gap-3 bg-surface px-6 py-5 shadow-sm">
        <div>
          <h1 className="text-xl font-extrabold text-ink">الإدارة</h1>
          <div className="text-[11px] text-ink-faint">الحسابات · إعدادات المنظومة · أنواع الاستثناءات · المحطات · سجل التغييرات</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {hasPermission('users:manage') && (
            <NavLink to="/admin/users" className={tabClass}>
              الحسابات
            </NavLink>
          )}
          {hasPermission('settings:manage') && (
            <NavLink to="/admin/settings" className={tabClass}>
              الإعدادات
            </NavLink>
          )}
          {hasPermission('exception_types:manage') && (
            <NavLink to="/admin/exception-types" className={tabClass}>
              أنواع الاستثناءات
            </NavLink>
          )}
          {hasPermission('stations:manage') && (
            <NavLink to="/admin/stations" className={tabClass}>
              المحطات
            </NavLink>
          )}
          {hasPermission('audit:view') && (
            <NavLink to="/admin/audit-log" className={tabClass}>
              سجل التغييرات
            </NavLink>
          )}
        </div>
      </div>
      <div className="p-6">
        <Outlet />
      </div>
    </div>
  );
}
