import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthProvider';
import { apiClient } from '../lib/apiClient';
import { roleLabel } from '../lib/labels';
import { APP_NAME, APP_TAGLINE } from '../lib/appInfo';
import { BrandMark } from './BrandMark';
import { Icon, ICONS } from './icons';
import { NAV_ACCESS, activeNavPath, singleDestination } from '../lib/navAccess';
import { NetworkBanner } from './NetworkBanner';
import { NotificationBell } from './NotificationBell';

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
  // One short word for the phone bottom bar, which must stay on one line.
  // The full name stays in the side menu and the phone menu sheet.
  shortLabel?: string;
  icon: JSX.Element;
  show: boolean;
  badge?: number;
}

export function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const stationName = user?.stationScope[0]?.name;
  const roleName = user?.roles[0] ? roleLabel(user.roles[0]) : '';

  const canSeeChangeRequests = hasPermission('vehicles:approve_change');
  const changeRequestsBadgeQuery = useQuery({
    queryKey: ['nav', 'change-requests-pending-count'],
    queryFn: async () =>
      (
        await apiClient.get<unknown[]>('/vehicles/change-requests', {
          params: { status: 'PENDING', take: 100 },
        })
      ).data.length,
    // Only while the menu item is shown (hidden after review, 15 Oct 2026).
    enabled: canSeeChangeRequests && NAV_ACCESS.changeRequests(hasPermission),
    staleTime: 60_000,
  });

  const navItems: NavItem[] = [
    // Round 19: "why does the home screen only appear once upon login and
    // then you don't have an option to get back to that page" — HomePage
    // ("/") had no persistent nav entry anywhere (sidebar, mobile sheet, or
    // bottom bar). Always shown. Who sees each destination below comes from
    // lib/navAccess.ts, the same list the home screen's cards read.
    // …except for someone with one job (the station employee: recording), whose
    // home IS that screen (singleDestination, lib/navAccess.ts).
    { to: '/', label: 'الرئيسية', icon: <Icon d={ICONS.home} />, show: !singleDestination(hasPermission) },
    {
      to: '/fillups/new',
      label: 'تسجيل تعبئة',
      shortLabel: 'تعبئة',
      icon: <Icon d={ICONS.fillup} />,
      show: NAV_ACCESS.fillup(hasPermission),
    },
    // Registration pivot, phase 2: the registration employee's workspace.
    {
      to: '/registration',
      label: 'تسجيل المركبات',
      shortLabel: 'تسجيل',
      icon: <Icon d={ICONS.register} />,
      show: NAV_ACCESS.registration(hasPermission),
    },
    {
      to: '/vehicles',
      label: 'المركبات',
      shortLabel: 'المركبات',
      icon: <Icon d={ICONS.vehicles} />,
      show: NAV_ACCESS.vehicles(hasPermission),
    },
    {
      to: '/reports/violations',
      label: 'الاستثناءات',
      shortLabel: 'الاستثناءات',
      icon: <Icon d={ICONS.violations} />,
      show: NAV_ACCESS.violations(hasPermission),
    },
    {
      to: '/vehicles/change-requests',
      label: 'طلبات تصحيح الهوية',
      icon: <Icon d={ICONS.changeRequests} />,
      show: NAV_ACCESS.changeRequests(hasPermission),
      badge: changeRequestsBadgeQuery.data,
    },
    {
      to: '/reports',
      label: 'التقارير',
      icon: <Icon d={ICONS.reports} />,
      show: NAV_ACCESS.reports(hasPermission),
    },
    {
      to: '/reports/daily',
      label: 'تقرير المحطة اليومي',
      icon: <Icon d={ICONS.reports} />,
      show: NAV_ACCESS.dailyReport(hasPermission),
    },
    // Phase 5A: each level's own place for its places and people.
    { to: '/manage', label: 'إدارة المحطات', icon: <Icon d={ICONS.stations} />, show: NAV_ACCESS.manage(hasPermission) },
    { to: '/monitoring', label: 'مراقبة المحطات', icon: <Icon d={ICONS.fuel} />, show: NAV_ACCESS.monitoring(hasPermission) },
    { to: '/my-station', label: 'محطتي', icon: <Icon d={ICONS.stations} />, show: NAV_ACCESS.myStation(hasPermission) },
    { to: '/my-office', label: 'مكتبي', icon: <Icon d={ICONS.register} />, show: NAV_ACCESS.myOffice(hasPermission) },
    { to: '/stations', label: 'المحطات', icon: <Icon d={ICONS.stations} />, show: NAV_ACCESS.stations(hasPermission) },
    { to: '/admin', label: 'الإدارة', icon: <Icon d={ICONS.admin} />, show: NAV_ACCESS.admin(hasPermission) },
  ].filter((item) => item.show);
  // One current item for the address, the same on the side menu, the phone bar
  // and the phone sheet (lib/navAccess.ts: the longest matching path).
  const activeTo = activeNavPath(
    navItems.map((i) => i.to),
    pathname,
  );

  // Bottom bar: the four things done most often, per 2a — capped at 4,
  // "بحث" always occupies the last available slot and deep-links into the
  // vehicles directory (its search box accepts plate, booklet, or chassis
  // — see 5a), matching the earlier decision that search is not its own
  // destination.
  const mostUsed = navItems.filter((i) =>
    ['/fillups/new', '/vehicles', '/reports/violations', '/reports/daily'].includes(i.to),
  );
  // A registration employee has none of the fuel destinations, so their own
  // workspace takes a tab instead of leaving the bar with one item.
  const bottomBarCandidates: NavItem[] =
    mostUsed.length < 3
      ? navItems.filter((i) => i.to === '/registration' || mostUsed.includes(i))
      : mostUsed;
  const showSearchTab = NAV_ACCESS.vehicles(hasPermission);
  const bottomBarItems = bottomBarCandidates.slice(0, showSearchTab ? 3 : 4);
  // One destination and nothing to search: a bar with one tab is no help.
  const showBottomBar = bottomBarItems.length + (showSearchTab ? 1 : 0) > 1;
  const showBell = hasPermission('notifications:read');

  // The phone menu sheet: named groups, and anything not in a named group goes
  // into a last one, so a destination can never be missing from the sheet
  // («تسجيل المركبات» was).
  const SHEET_GROUPS: Array<{ title: string; paths: string[] }> = [
    { title: '', paths: ['/'] },
    { title: 'التسجيل والمتابعة', paths: ['/fillups/new', '/registration', '/reports', '/reports/daily', '/reports/violations'] },
    { title: 'السجلات', paths: ['/vehicles', '/stations', '/vehicles/change-requests'] },
    { title: 'محطتي ومكتبي', paths: ['/manage', '/monitoring', '/my-station', '/my-office'] },
    { title: 'الإدارة', paths: ['/admin'] },
  ];
  const grouped = new Set(SHEET_GROUPS.flatMap((g) => g.paths));
  const sheetGroups = [
    ...SHEET_GROUPS.map((g) => ({ title: g.title, items: navItems.filter((i) => g.paths.includes(i.to)) })),
    { title: 'أخرى', items: navItems.filter((i) => !grouped.has(i.to)) },
  ];

  function closeSheetAnd(fn?: () => void) {
    setSheetOpen(false);
    fn?.();
  }

  return (
    // --bottom-bar: the height the phone's bottom bar takes, for anything fixed
    // above it (the fill-up screen's button bar) — 0 when there is no bar (the
    // station employee, after review 18 Oct 2026), so nothing floats over a gap.
    <div
      dir="rtl"
      className="flex min-h-[100dvh] flex-col bg-paper lg:min-h-screen lg:flex-row"
      // --chrome-extra: what the bottom bar and the room kept for it add (58px
      // bar + 64px more padding), for screens sized to the visible height.
      style={{ '--bottom-bar': showBottomBar ? '58px' : '0px', '--chrome-extra': showBottomBar ? '122px' : '0px' } as React.CSSProperties}
    >
      {/* Desktop sidebar (end/right side) — hidden below lg.
          Order matters here: with dir="rtl" and the default flex-direction
          row, the flex main-axis start is the physical RIGHT edge — so the
          sidebar needs the LOWER order value to land there. This was
          previously order-2 (main was order-1), which pushed the sidebar
          to the main-axis end (the physical LEFT) instead — confirmed via
          a Playwright bounding-box measurement in the round-2 verification
          pass, not something a glance at the source would catch. */}
      {/* Phase 7 (Mohamed): the menu stays in place while the page scrolls under
          it — sticky to the top, the height of the screen. A long menu scrolls
          inside itself; the account card stays at the bottom. */}
      <aside className="order-1 hidden w-60 shrink-0 flex-col border-s border-line-soft bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start">
        <div className="flex items-center gap-2.5 px-5 py-6">
          <BrandMark size={34} />
          <div>
            <p className="text-[17px] font-extrabold text-primary">{APP_NAME}</p>
            {/* The user's own directorate, from their places (GET /auth/me) —
                never one municipality's name in code; the super admin, who
                belongs to none, sees the app's tagline. */}
            <p className="text-[13px] lg:text-[12px] font-medium text-ink-faint" data-testid="sidebar-directorate">
              {user?.directorates?.length ? user.directorates.join('، ') : APP_TAGLINE}
            </p>
          </div>
        </div>
        <nav className="scrollbar-none min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={item.to === activeTo ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-[13px] lg:text-[12.5px] font-bold transition ${
                item.to === activeTo ? 'bg-primary text-white shadow-sm' : 'text-ink-soft hover:bg-surface-alt'
              }`}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {!!item.badge && (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[13px] lg:text-[12px] font-extrabold text-ink">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>
        {/* Round 14: this used to be two bare text links side by side — the
            client flagged it directly as looking unfinished next to the
            pill-styled nav above it. Now a small account card (avatar +
            name/role) with two proper icon buttons underneath, matching
            the same rounded-full/hover-tint vocabulary the nav items and
            PillButton already use elsewhere, not a new pattern. */}
        <div className="border-t border-line-soft p-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-surface-alt/70 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[13px] lg:text-[12px] font-extrabold text-primary">
              {(user?.fullName ?? '').trim().slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] lg:text-[12.5px] font-bold text-ink">{user?.fullName}</p>
              <p className="truncate text-[13px] lg:text-[12px] text-ink-faint">
                {roleName}
                {stationName ? ` · ${stationName}` : ''}
              </p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <NavLink
              to="/change-password"
              className="flex items-center justify-center gap-1.5 rounded-full bg-surface-alt py-2 text-[13px] lg:text-[12px] font-bold text-ink-soft transition hover:bg-primary-100 hover:text-primary"
            >
              <Icon d={ICONS.lock} />
              كلمة المرور
            </NavLink>
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center justify-center gap-1.5 rounded-full border border-line bg-surface py-2 text-[13px] lg:text-[12px] font-bold text-ink transition hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark"
            >
              <Icon d={ICONS.logout} />
              خروج
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar — hidden at lg+ */}
      <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-line-soft bg-surface px-3.5 py-2.5 shadow-sm lg:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="القائمة"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-alt"
        >
          <Icon d={ICONS.menu} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] lg:text-[12.5px] font-extrabold text-ink">{stationName ?? APP_NAME}</p>
          <p className="truncate text-[13px] lg:text-[12px] text-ink-faint">
            {roleName}
            {user?.fullName ? ` · ${user.fullName}` : ''}
          </p>
        </div>
        {showBell && <NotificationBell align="start" />}
      </header>

      {/* Single shared content outlet — every page mounts exactly once.
          Previously each shell (desktop/mobile) rendered its own <Outlet />,
          hidden via CSS but still fully mounted — every route's component
          ran twice simultaneously (duplicated state, duplicated queries,
          duplicated data-testid nodes breaking any page-level selector).
          Found via the runtime-verification screenshot pass, not by
          reading the source. */}
      {/* pb-20 (not pb-4): the fixed bottom nav below is ~58px tall and
          floats over the last 58px of ANY scroll position, not just the
          initial viewport — min-h above only guarantees a short page fills
          the screen, it doesn't stop a genuinely tall page's own content
          from ending underneath the nav where it's unreachable/unclickable
          no matter how far the user scrolls. Found via round 8's e2e run:
          the mobile wizard's inline vehicle-create sub-form is tall enough
          that its own save button landed in that dead zone and Playwright
          (correctly) refused to click through the nav sitting on top of
          it — a real bug, not a flaky test. lg:p-6 (desktop, no fixed
          nav) is unaffected. */}
      <main
        className={`order-2 overflow-x-hidden p-3.5 lg:min-h-screen lg:flex-1 lg:p-6 ${
          // flex-1: the content fills what the top bar leaves, whatever its height
          // (a fixed 56px was 4px short of the real bar: every page scrolled).
          showBottomBar ? 'flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]' : 'flex-1 pb-[calc(1rem+env(safe-area-inset-bottom))]'
        }`}
      >
        {showBell && (
          <div className="mb-4 hidden justify-end lg:flex">
            <NotificationBell align="start" />
          </div>
        )}
        <NetworkBanner />
        <Outlet />
      </main>

      {/* Mobile bottom bar — hidden at lg+. Equal-width items, one-line labels
          that are always visible, and padding for the iPhone home indicator
          (env(safe-area-inset-bottom), which needs viewport-fit=cover). */}
      {showBottomBar && (
        <nav
          aria-label="التنقل السريع"
          className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line-soft bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(19,37,36,.18)] lg:hidden"
          style={{ gridTemplateColumns: `repeat(${bottomBarItems.length + (showSearchTab ? 1 : 0)}, minmax(0, 1fr))` }}
        >
          {bottomBarItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              // The bar shows one short word, but the link keeps its full name for
              // screen readers and voice control (the visible word is part of it).
              aria-label={item.shortLabel ? item.label : undefined}
              aria-current={item.to === activeTo ? 'page' : undefined}
              className={`relative flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[15px] lg:text-[13px] font-bold leading-tight ${
                item.to === activeTo ? 'text-primary' : 'text-ink-soft'
              }`}
            >
              {item.icon}
              <span className="max-w-full whitespace-nowrap">{item.shortLabel ?? item.label}</span>
              {!!item.badge && (
                <span className="absolute end-[18%] top-1 rounded-full bg-accent px-1.5 text-[13px] lg:text-[12px] font-extrabold text-ink">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
          {showSearchTab && (
            <button
              type="button"
              onClick={() => navigate('/vehicles')}
              className="flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[15px] lg:text-[13px] font-bold leading-tight text-ink-soft"
            >
              <Icon d={ICONS.search} />
              <span className="whitespace-nowrap">بحث</span>
            </button>
          )}
        </nav>
      )}

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
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[15px] lg:text-[13px] font-extrabold text-primary">
                {(user?.fullName ?? '').trim().slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] lg:text-[13px] font-extrabold text-ink">{user?.fullName}</p>
                <p className="truncate text-[13px] lg:text-[12px] text-ink-faint">
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

            {sheetGroups.map((group) => (
              <NavGroup key={group.title || 'home'} title={group.title} items={group.items} activeTo={activeTo} onNavigate={setSheetOpen} />
            ))}

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line-soft pt-3">
              <NavLink
                to="/change-password"
                onClick={() => setSheetOpen(false)}
                className="flex items-center justify-center gap-1.5 rounded-full bg-surface-alt py-2.5 text-[13px] lg:text-[12px] font-bold text-ink-soft"
              >
                <Icon d={ICONS.lock} />
                كلمة المرور
              </NavLink>
              <button
                type="button"
                onClick={() => closeSheetAnd(() => logout())}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-line bg-surface py-2.5 text-[15px] lg:text-[12px] font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark"
              >
                <Icon d={ICONS.logout} />
                خروج
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function NavGroup({
  title,
  items,
  activeTo,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  activeTo: string | null;
  onNavigate: (open: boolean) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      {title && <p className="mb-1 px-3.5 text-[13px] lg:text-[12px] font-extrabold text-ink-faint">{title}</p>}
      <div className="space-y-0.5">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => onNavigate(false)}
            aria-current={item.to === activeTo ? 'page' : undefined}
            className={`flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-[13px] lg:text-[12.5px] font-bold ${
              item.to === activeTo ? 'bg-primary-100 text-primary' : 'text-ink hover:bg-surface-alt'
            }`}
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {!!item.badge && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[13px] lg:text-[12px] font-extrabold text-ink">{item.badge}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
