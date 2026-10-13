import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { useAuth } from '../auth/AuthProvider';
import { OpsReportPanel, type OpsReportKey } from './OpsReportPanel';

// «التقارير» (phase 5B, section 3): the reports each job needs, behind one
// destination. A person with several (a super admin) gets a tab per report; a
// station employee gets only their shift. The API decides what each may read.

interface ReportDef {
  key: OpsReportKey;
  label: string;
  title: string;
  subtitle: string;
  allowed: (has: (permission: string) => boolean) => boolean;
}

export const REPORT_DEFS: ReportDef[] = [
  {
    key: 'my-shift',
    label: 'مناوبتي',
    title: 'تقرير مناوبتي',
    subtitle: 'تعبئات اليوم ولتراتها',
    allowed: (has) => has('reports:own_shift') && !has('reports:view'),
  },
  {
    key: 'my-day',
    label: 'يومي',
    title: 'تقرير يومي',
    subtitle: 'المركبات التي سجّلتها والبطاقات التي أصدرتها والطباعات الفاشلة',
    allowed: (has) => has('registration_reports:own_day') && !has('registration_reports:view'),
  },
  {
    key: 'office',
    label: 'مكتب التسجيل',
    title: 'تقارير مكتب التسجيل',
    subtitle: 'التسجيل والبطاقات لكل موظف، والتالف، والتكرارات، والتصحيحات، ومخزون البطاقات',
    allowed: (has) => has('registration_reports:view'),
  },
  {
    key: 'station',
    label: 'المحطة',
    title: 'تقارير المحطة',
    subtitle: 'التعبئات حسب اليوم والوقود والتعريف والموظف، والاستثناءات، والمخزون',
    allowed: (has) => has('reports:view'),
  },
  {
    key: 'municipality',
    label: 'البلدية',
    title: 'تقارير البلدية',
    subtitle: 'كل المحطات والمكاتب، ومطابقة الوقود، والجاهزية للموعد النهائي',
    allowed: (has) => has('reports:municipality'),
  },
  {
    key: 'summary',
    label: 'ملخص البلديات',
    title: 'مقارنة البلديات',
    subtitle: 'ملخص كل البلديات في جدول واحد',
    allowed: (has) => has('reports:cross_municipality'),
  },
];

export function RolesReportsPage() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const available = REPORT_DEFS.filter((d) => d.allowed(hasPermission));
  const chosen = available.find((d) => d.key === params.get('report')) ?? available[0];

  if (!chosen) {
    return (
      <div>
        <PageHeader title="التقارير" />
        <Card className="p-6 text-[16px] text-ink-soft lg:text-[14px]">لا توجد تقارير مرتبطة بحسابك.</Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={chosen.title} subtitle={chosen.subtitle} />
      {available.length > 1 && (
        <div role="tablist" aria-label="التقارير" className="mb-4 flex flex-wrap gap-2">
          {available.map((def) => {
            const active = def.key === chosen.key;
            return (
              <button
                key={def.key}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`reports-tab-${def.key}`}
                onClick={() =>
                  setParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set('report', def.key);
                    return next;
                  })
                }
                className={`min-h-[44px] rounded-full px-5 text-[16px] font-bold lg:text-[14px] ${
                  active ? 'bg-primary text-white' : 'bg-surface text-ink-soft hover:bg-surface-alt'
                }`}
              >
                {def.label}
              </button>
            );
          })}
        </div>
      )}
      <OpsReportPanel key={chosen.key} report={chosen.key} />
    </div>
  );
}
