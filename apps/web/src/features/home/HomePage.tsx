import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { roleLabel } from '../../lib/labels';
import { Icon, ICONS } from '../../components/icons';
import { NAV_ACCESS, type HasPermission } from '../../lib/navAccess';
import { orderHomeLinks } from '../../lib/homeOrder';
import { StockStrip } from '../stock/StockStrip';

interface QuickLink {
  to: string;
  label: string;
  hint: string;
  // From lib/navAccess.ts — the same rule the side menu and the phone menu
  // use, so a card appears for exactly the people whose menu shows it.
  show: (has: HasPermission) => boolean;
  icon: keyof typeof ICONS;
}

const QUICK_LINKS: QuickLink[] = [
  { to: '/fillups/new', label: 'تسجيل تعبئة', hint: 'تسجيل عملية تعبئة جديدة لمركبة', show: NAV_ACCESS.fillup, icon: 'fillup' },
  { to: '/registration', label: 'تسجيل المركبات', hint: 'تسجيل مالك ومركبة في مكتب التسجيل', show: NAV_ACCESS.registration, icon: 'register' },
  { to: '/vehicles', label: 'المركبات', hint: 'البحث عن مركبة وعرض سجلها', show: NAV_ACCESS.vehicles, icon: 'vehicles' },
  { to: '/reports/violations', label: 'الاستثناءات', hint: 'ما استُخدم منها في محطتك أو بلديتك', show: NAV_ACCESS.violations, icon: 'violations' },
  { to: '/reports', label: 'التقارير', hint: 'التقارير التي تحتاجها وظيفتك', show: NAV_ACCESS.reports, icon: 'reports' },
  { to: '/reports/daily', label: 'اليوم', hint: 'تعبئات اليوم وأرقام المحطات والمديرية', show: NAV_ACCESS.dailyReport, icon: 'reports' },
  { to: '/vehicles/change-requests', label: 'طلبات التعديل', hint: 'طلبات تغيير هوية المركبات', show: NAV_ACCESS.changeRequests, icon: 'changeRequests' },
  { to: '/stations', label: 'المحطات', hint: 'قائمة محطات المديرية', show: NAV_ACCESS.stations, icon: 'stations' },
  { to: '/manage', label: 'إدارة المحطات', hint: 'محطات الوقود ومكاتب التسجيل في بلديتك وأشخاصها', show: NAV_ACCESS.manage, icon: 'stations' },
  { to: '/monitoring', label: 'مراقبة المحطات', hint: 'مخزون الوقود في المحطات، والتوريد والتصفير، والصرف', show: NAV_ACCESS.monitoring, icon: 'fuel' },
  { to: '/my-station', label: 'محطتي', hint: 'موظفو محطتك والوقود الذي تبيعه والنشاط', show: NAV_ACCESS.myStation, icon: 'stations' },
  { to: '/my-office', label: 'مكتبي', hint: 'موظفو مكتبك وتقاريره اليومية', show: NAV_ACCESS.myOffice, icon: 'register' },
  { to: '/admin', label: 'الإدارة', hint: 'البلديات والإعدادات وقواعد التعبئة والقوائم وسجل التدقيق', show: NAV_ACCESS.admin, icon: 'admin' },
];

// Round 16: a first-name-only, time-of-day greeting reads as a system that
// notices, not a static label — cheap to compute, no backend involved.
function timeGreeting(): string {
  return new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير';
}

// No dedicated design artboard for this screen (documented gap) — brought
// onto the shared PageHeader/Card vocabulary rather than left in the
// pre-design-system plain-slate state. Quick links are permission-gated the
// same way Layout.tsx's nav is, so a station_employee only sees what they
// can actually reach.
export function HomePage() {
  const { user, hasPermission } = useAuth();
  const links = orderHomeLinks(
    QUICK_LINKS.filter((link) => link.show(hasPermission)),
    hasPermission,
  );
  // Petrol stations and/or registration stations the user is scoped to;
  // "كل المحطات" only for the directorate-wide roles that genuinely see all.
  const scopeNames = [
    ...(user?.stationScope ?? []).map((s) => s.name),
    ...(user?.registrationStationScope ?? []).map((s) => s.name),
  ];
  const scopeLabel =
    scopeNames.length > 0
      ? scopeNames.join('، ')
      : hasPermission('reports:view_all_stations')
        ? 'كل المحطات'
        : 'لم يُحدَّد نطاق بعد';

  return (
    <div>
      <PageHeader
        title={`${timeGreeting()}، ${user?.fullName ?? ''}`}
        subtitle={
          user
            ? `${user.roles.map(roleLabel).join('، ')} — ${scopeLabel}`
            : undefined
        }
      />

      {(user?.stationScope ?? []).slice(0, 2).map((st) => (
        <div key={st.stationId} className="mb-4">
          <StockStrip stationId={st.stationId} title={`مخزون الوقود — ${st.name}`} />
        </div>
      ))}

      {links.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link, i) => (
            <Link key={link.to} to={link.to} className="group block animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
              <Card className="flex items-start gap-3 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <Icon d={ICONS[link.icon]} size={18} />
                </span>
                <span className="min-w-0">
                  <p className="text-[16px] lg:text-[14px] font-extrabold text-ink">{link.label}</p>
                  <p className="mt-1 text-[13px] lg:text-[12px] text-ink-soft">{link.hint}</p>
                </span>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-6 text-[15px] lg:text-[13px] text-ink-soft">لا توجد صلاحيات مرتبطة بحسابك حاليًا.</Card>
      )}

    </div>
  );
}
