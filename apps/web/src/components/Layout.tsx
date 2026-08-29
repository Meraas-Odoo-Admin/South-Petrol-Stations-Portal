import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthProvider';
import { apiClient } from '../lib/apiClient';
import { roleLabel } from '../lib/labels';

// Rebuilt against design/"Fuel Control System - Round 2 Screens.dc.html"
// artboard 2a ("تنقّل الهاتف — نمط مقصود، لا قائمة سطح مكتب ملتفّة"): the
// mobile nav is its own designed pattern (collapsed top+bottom bar, a
// top-dropping sheet for everything else), not the desktop nav re-flowed
// into a stacked list. Desktop sidebar structure matches 5a's left rail
// (brand + full nav list; content to its start side, sidebar on the end/
// right side of the RTL layout per design-system-notes.md's "sidebar nav
// on the right in desktop shells").

interface NavItem {
  to: string;
  label: string;
  icon: JSX.Element;
  show: boolean;
  badge?: number;
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  dashboard: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z',
  fillup: 'M4 21V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v13M2 21h14m3-13 2.5 2.5a1.5 1.5 0 0 1 .5 1.1V18a1.5 1.5 0 0 1-3 0v-3.5M8 8V4M4 12h8',
  vehicles: 'M3 13l1.6-5A2 2 0 0 1 6.5 6.5h11a2 2 0 0 1 1.9 1.5L21 13v6a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Z',
  drivers: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  violations: 'M12 9v4m0 4h.01M10.3 3.9 2.4 18a1.8 1.8 0 0 0 1.6 2.7h16a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z',
  changeRequests: 'M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3M9 15h3l8-8a2 2 0 0 0-3-3l-8 8v3Z',
  reports: 'M8 7h8M8 12h8M8 17h5M4 4h16v16H4V4Z',
  stations: 'M4 21V8l8-5 8 5v13M9 21v-6h6v6M4 21h16',
  admin: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 1-.1 1.3l2 1.6-2 3.4-2.4-1a7 7 0 0 1-2.2 1.3l-.4 2.5H9.7l-.4-2.5a7 7 0 0 1-2.2-1.3l-2.4 1-2-3.4 2-1.6a7.4 7.4 0 0 1 0-2.6l-2-1.6 2-3.4 2.4 1a7 7 0 0 1 2.2-1.3L9.7 2h4.6l.4 2.5a7 7 0 0 1 2.2 1.3l2.4-1 2 3.4-2 1.6c.07.4.1.9.1 1.2Z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
};

export function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const stationName = user?.stationScope[0]?.name;
  const roleName = user?.roles[0] ? roleLabel(user.roles[0]) : '';

  const canApprove = hasPermission('fillups:approve_exception') || hasPermission('reports:view');
  const violationsBadgeQuery = useQuery({
    queryKey: ['nav', 'violations-pending-count'],
    queryFn: async () =>
      (
        await apiClient.get<{ total: number }>('/reports/violations', {
          params: { status: 'pending', skip: 0, take: 1 },
        })
      ).data.total,
    enabled: canApprove,
    staleTime: 60_000,
  });

  const canSeeChangeRequests = hasPermission('vehicles:approve_change');
  const changeRequestsBadgeQuery = useQuery({
    queryKey: ['nav', 'change-requests-pending-count'],
    queryFn: async () =>
      (
        await apiClient.get<unknown[]>('/vehicles/change-requests', {
          params: { status: 'PENDING', take: 100 },
        })
      ).data.length,
    enabled: canSeeChangeRequests,
    staleTime: 60_000,
  });

  const navItems: NavItem[] = [
    {
      to: '/reports/dashboard',
      label: 'لوحة المتابعة',
      icon: <Icon d={ICONS.dashboard} />,
      show: hasPermission('reports:view_all_stations'),
    },
    {
      to: '/fillups/new',
      label: 'تسجيل تعبئة',
      icon: <Icon d={ICONS.fillup} />,
      show: hasPermission('fillups:create'),
    },
    {
      to: '/vehicles',
      label: 'المركبات',
      icon: <Icon d={ICONS.vehicles} />,
      show: hasPermission('vehicles:read'),
    },
    {
      to: '/drivers',
      label: 'السائقون',
      icon: <Icon d={ICONS.drivers} />,
      show: hasPermission('drivers:read'),
    },
    {
      to: '/reports/violations',
      label: 'المخالفات والاستثناءات',
      icon: <Icon d={ICONS.violations} />,
      show: hasPermission('reports:view'),
      badge: violationsBadgeQuery.data,
    },
    {
      to: '/vehicles/change-requests',
      label: 'طلبات تصحيح الهوية',
      icon: <Icon d={ICONS.changeRequests} />,
      show: canSeeChangeRequests,
      badge: changeRequestsBadgeQuery.data,
    },
    {
      to: '/reports/daily',
      label: 'التقارير',
      icon: <Icon d={ICONS.reports} />,
      show: hasPermission('reports:view'),
    },
    {
      to: '/stations',
      label: 'المحطات',
      icon: <Icon d={ICONS.stations} />,
      show: hasPermission('stations:read'),
    },
    {
      to: '/admin',
      label: 'الإدارة',
      icon: <Icon d={ICONS.admin} />,
      show: hasPermission('users:manage'),
    },
  ].filter((item) => item.show);

  // Bottom bar: the four things done most often, per 2a — capped at 4,
  // "بحث" always occupies the last available slot and deep-links into the
  // vehicles directory (its search box accepts plate, booklet, chassis, or
  // driver name — see 5a), matching the earlier decision that search is
  // not its own destination.
  const bottomBarCandidates: NavItem[] = navItems.filter((i) =>
    ['/fillups/new', '/vehicles', '/drivers', '/reports/violations', '/reports/dashboard'].includes(i.to),
  );
  const bottomBarItems = bottomBarCandidates.slice(0, hasPermission('vehicles:read') ? 3 : 4);
  const showSearchTab = hasPermission('vehicles:read');

  function closeSheetAnd(fn?: () => void) {
    setSheetOpen(false);
    fn?.();
  }

  return (
    <div dir="rtl" className="min-h-screen bg-paper lg:flex">
      {/* Desktop sidebar (end/right side) — hidden below lg.
          Order matters here: with dir="rtl" and the default flex-direction
          row, the flex main-axis start is the physical RIGHT edge — so the
          sidebar needs the LOWER order value to land there. This was
          previously order-2 (main was order-1), which pushed the sidebar
          to the main-axis end (the physical LEFT) instead — confirmed via
          a Playwright bounding-box measurement in the round-2 verification
          pass, not something a glance at the source would catch. */}
      <aside className="order-1 hidden w-60 shrink-0 flex-col border-s border-surface-alt bg-surface lg:flex">
        <div className="px-5 py-6">
          <p className="text-[17px] font-extrabold text-primary">ضابط</p>
          <p className="text-[10.5px] font-medium text-ink-faint">مديرية أمن سبها</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/vehicles' || item.to === '/drivers' || item.to === '/stations'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-[12.5px] font-bold transition ${
                  isActive ? 'bg-primary text-white shadow-sm' : 'text-ink-soft hover:bg-surface-alt'
                }`
              }
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {!!item.badge && (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-surface-alt px-4 py-4">
          <p className="truncate text-[12.5px] font-bold text-ink">{user?.fullName}</p>
          <p className="text-[10.5px] text-ink-faint">
            {roleName}
            {stationName ? ` · ${stationName}` : ''}
          </p>
          <div className="mt-2.5 flex gap-3 text-[11px] font-bold text-ink-soft">
            <NavLink to="/change-password" className="hover:text-primary">
              تغيير كلمة المرور
            </NavLink>
            <button type="button" onClick={() => logout()} className="hover:text-danger">
              خروج
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar — hidden at lg+ */}
      <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-surface-alt bg-surface px-3.5 py-2.5 shadow-sm lg:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="القائمة"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-alt"
        >
          <Icon d={ICONS.menu} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-extrabold text-ink">{stationName ?? 'ضابط'}</p>
          <p className="truncate text-[10.5px] text-ink-faint">
            {roleName}
            {user?.fullName ? ` · ${user.fullName}` : ''}
          </p>
        </div>
      </header>

      {/* Single shared content outlet — every page mounts exactly once.
          Previously each shell (desktop/mobile) rendered its own <Outlet />,
          hidden via CSS but still fully mounted — every route's component
          ran twice simultaneously (duplicated state, duplicated queries,
          duplicated data-testid nodes breaking any page-level selector).
          Found via the runtime-verification screenshot pass, not by
          reading the source. */}
      <main className="order-2 min-h-[calc(100vh-56px-58px)] overflow-x-hidden p-3.5 pb-4 lg:min-h-screen lg:flex-1 lg:p-6">
        <Outlet />
      </main>

      {/* Mobile bottom bar — hidden at lg+ */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-surface-alt bg-surface shadow-[0_-8px_24px_-12px_rgba(19,37,36,.18)] lg:hidden" style={{ gridTemplateColumns: `repeat(${bottomBarItems.length + (showSearchTab ? 1 : 0)}, 1fr)` }}>
        {bottomBarItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/vehicles' || item.to === '/drivers'}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-bold ${
                isActive ? 'text-primary' : 'text-ink-faint'
              }`
            }
          >
            {item.icon}
            {item.label}
            {!!item.badge && (
              <span className="absolute end-[22%] top-1 rounded-full bg-accent px-1 text-[9px] font-extrabold text-white">
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
        {showSearchTab && (
          <button
            type="button"
            onClick={() => navigate('/vehicles')}
            className="flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-bold text-ink-faint"
          >
            <Icon d={ICONS.search} />
            بحث
          </button>
        )}
      </nav>

      {sheetOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="إغلاق"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-x-0 top-0 max-h-[85vh] overflow-y-auto rounded-b-lg bg-surface p-4 shadow-lg">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[13px] font-extrabold text-primary">
                {(user?.fullName ?? '').trim().slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-extrabold text-ink">{user?.fullName}</p>
                <p className="truncate text-[11px] text-ink-faint">
                  {roleName}
                  {stationName ? ` · ${stationName}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="إغلاق"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-surface-alt"
              >
                <Icon d={ICONS.close} />
              </button>
            </div>

            <NavGroup title="التسجيل والمتابعة" items={navItems.filter((i) => ['/fillups/new', '/reports/daily', '/reports/violations', '/reports/dashboard'].includes(i.to))} onNavigate={setSheetOpen} />
            <NavGroup title="السجلات" items={navItems.filter((i) => ['/vehicles', '/drivers', '/stations', '/vehicles/change-requests'].includes(i.to))} onNavigate={setSheetOpen} />
            <NavGroup title="الإدارة" items={navItems.filter((i) => i.to === '/admin')} onNavigate={setSheetOpen} />

            <div className="mt-3 space-y-0.5 border-t border-surface-alt pt-3">
              <NavLink
                to="/change-password"
                onClick={() => setSheetOpen(false)}
                className="block rounded-full px-3.5 py-2.5 text-[12.5px] font-bold text-ink-soft hover:bg-surface-alt"
              >
                تغيير كلمة المرور
              </NavLink>
              <button
                type="button"
                onClick={() => closeSheetAnd(() => logout())}
                className="block w-full rounded-full px-3.5 py-2.5 text-start text-[12.5px] font-bold text-danger hover:bg-danger-100"
              >
                خروج
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavGroup({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate: (open: boolean) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="mb-1 px-3.5 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-faint">{title}</p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => onNavigate(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-[12.5px] font-bold ${
                isActive ? 'bg-primary-100 text-primary' : 'text-ink hover:bg-surface-alt'
              }`
            }
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {!!item.badge && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-extrabold text-white">{item.badge}</span>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
