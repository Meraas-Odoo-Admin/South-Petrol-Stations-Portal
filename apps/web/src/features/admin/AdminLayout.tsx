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

  // One list drives both the tabs and the subtitle, so the subtitle can
  // only ever name sections the person can actually open (phase 4b).
  const tabs = [
    { to: '/admin/users', label: 'الحسابات', show: hasPermission('users:manage') },
    { to: '/admin/registration-stations', label: 'مكاتب التسجيل', show: hasPermission('registration_stations:manage') },
    {
      to: '/admin/municipalities',
      label: 'البلديات',
      // The directorate admin sets the two stage dates but nothing else; the
      // tab opens for them with only that on it.
      show: hasPermission('municipalities:manage') || hasPermission('municipalities:set_stage_dates'),
    },
    { to: '/admin/security-authorities', label: 'الجهات الأمنية', show: hasPermission('security_authorities:manage') },
    { to: '/admin/settings', label: 'الإعدادات', show: hasPermission('settings:manage') },
    { to: '/admin/exception-types', label: 'أنواع الاستثناءات', show: hasPermission('exception_types:manage') },
    { to: '/admin/vehicle-types', label: 'أنواع المركبات', show: hasPermission('vehicle_types:manage') },
    { to: '/admin/audit-log', label: 'سجل التغييرات', show: hasPermission('audit:view') },
  ].filter((tab) => tab.show);

  return (
    <div className="-m-4 min-h-[calc(100vh-56px)] bg-paper">
      <div className="flex flex-wrap items-end justify-between gap-3 bg-surface px-6 py-5 shadow-sm">
        <div>
          <h1 className="text-xl font-extrabold text-ink">الإدارة</h1>
          <div className="text-[12px] text-ink-soft">{tabs.map((tab) => tab.label).join(' · ')}</div>
        </div>
        <nav aria-label="أقسام الإدارة" className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className={tabClass}>
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="p-6">
        <Outlet />
      </div>
    </div>
  );
}
