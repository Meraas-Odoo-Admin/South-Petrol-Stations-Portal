import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { roleLabel } from '../../lib/labels';
import { Icon, ICONS } from '../../components/icons';
import { replayOnboardingTour } from '../../components/OnboardingTour';

interface QuickLink {
  to: string;
  label: string;
  hint: string;
  permission: string;
  icon: keyof typeof ICONS;
}

const QUICK_LINKS: QuickLink[] = [
  { to: '/fillups/new', label: 'تسجيل تعبئة', hint: 'تسجيل عملية تعبئة جديدة لمركبة', permission: 'fillups:create', icon: 'fillup' },
  { to: '/vehicles', label: 'المركبات', hint: 'البحث عن مركبة وعرض سجلها', permission: 'vehicles:read', icon: 'vehicles' },
  { to: '/reports/violations', label: 'المخالفات', hint: 'الحالات التي تحتاج قرارك', permission: 'reports:view', icon: 'violations' },
  { to: '/reports/daily', label: 'التقرير اليومي', hint: 'ملخص تعبئات اليوم', permission: 'reports:view', icon: 'reports' },
  { to: '/reports/dashboard', label: 'لوحة المتابعة', hint: 'نظرة عامة على المحطات', permission: 'reports:view_all_stations', icon: 'dashboard' },
  { to: '/vehicles/change-requests', label: 'طلبات التعديل', hint: 'طلبات تغيير هوية المركبات', permission: 'vehicles:approve_change', icon: 'changeRequests' },
  { to: '/stations', label: 'المحطات', hint: 'قائمة محطات المديرية', permission: 'stations:read', icon: 'stations' },
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
  const links = QUICK_LINKS.filter((link) => hasPermission(link.permission));

  return (
    <div>
      <PageHeader
        title={`${timeGreeting()}، ${user?.fullName ?? ''}`}
        subtitle={
          user
            ? `${user.roles.map(roleLabel).join('، ')} — ${
                user.stationScope.length > 0 ? user.stationScope.map((s) => s.name).join('، ') : 'كل المحطات'
              }`
            : undefined
        }
      />

      {links.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link, i) => (
            <Link key={link.to} to={link.to} className="group block animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
              <Card className="flex items-start gap-3 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <Icon d={ICONS[link.icon]} size={18} />
                </span>
                <span className="min-w-0">
                  <p className="text-[14px] font-extrabold text-ink">{link.label}</p>
                  <p className="mt-1 text-[12px] text-ink-soft">{link.hint}</p>
                </span>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-6 text-[13px] text-ink-soft">لا توجد صلاحيات مرتبطة بحسابك حاليًا.</Card>
      )}

      {/* Round 19: the onboarding tour only ever shows itself once
          automatically — this is the deliberate way back to it for anyone
          who skipped it, or just wants a refresher. */}
      {user && (
        <button
          type="button"
          onClick={() => replayOnboardingTour(user.id)}
          className="mt-4 flex items-center gap-1.5 text-[12px] font-bold text-ink-soft hover:text-primary"
        >
          <Icon d={ICONS.home} size={14} />
          إعادة الجولة التعريفية
        </button>
      )}
    </div>
  );
}
