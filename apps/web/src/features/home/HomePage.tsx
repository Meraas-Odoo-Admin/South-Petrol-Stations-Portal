import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { roleLabel } from '../../lib/labels';

interface QuickLink {
  to: string;
  label: string;
  hint: string;
  permission: string;
}

const QUICK_LINKS: QuickLink[] = [
  { to: '/fillups/new', label: 'تسجيل تعبئة', hint: 'تسجيل عملية تعبئة جديدة لمركبة', permission: 'fillups:create' },
  { to: '/vehicles', label: 'المركبات', hint: 'البحث عن مركبة وعرض سجلها', permission: 'vehicles:read' },
  { to: '/drivers', label: 'السائقون', hint: 'قائمة السائقين المسجَّلين', permission: 'drivers:read' },
  { to: '/reports/violations', label: 'المخالفات', hint: 'الحالات التي تحتاج قرارك', permission: 'reports:view' },
  { to: '/reports/daily', label: 'التقرير اليومي', hint: 'ملخص تعبئات اليوم', permission: 'reports:view' },
  { to: '/reports/dashboard', label: 'لوحة المتابعة', hint: 'نظرة عامة على المحطات', permission: 'reports:view_all_stations' },
  { to: '/vehicles/change-requests', label: 'طلبات التعديل', hint: 'طلبات تغيير هوية المركبات', permission: 'vehicles:approve_change' },
  { to: '/stations', label: 'المحطات', hint: 'قائمة محطات المديرية', permission: 'stations:read' },
];

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
        title={`مرحبًا، ${user?.fullName ?? ''}`}
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
          {links.map((link) => (
            <Link key={link.to} to={link.to}>
              <Card className="p-4 transition-shadow hover:shadow-md">
                <p className="text-[14px] font-extrabold text-ink">{link.label}</p>
                <p className="mt-1 text-[12px] text-ink-soft">{link.hint}</p>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-6 text-[13px] text-ink-soft">لا توجد صلاحيات مرتبطة بحسابك حاليًا.</Card>
      )}
    </div>
  );
}
