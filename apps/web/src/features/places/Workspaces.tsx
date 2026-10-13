import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card } from '../../components/design/Card';
import { StatusPill } from '../../components/design/StatusPill';
import { TabPanel, Tabs, useTab, type TabDef } from '../../components/design/Tabs';
import { RegistrationDesksEditor } from '../admin/RegistrationDesksEditor';
import { CardStockPanel } from '../regreports/CardStockPage';
import { tripoliToday, addDays, stamp } from '../regreports/common';
import { OpsReportPanel } from '../reports/OpsReportPanel';
import type { OpsReport } from '../reports/OpsReportView';
import { FuelStockPanel } from '../stock/FuelStockPanel';
import { StockStrip } from '../stock/StockStrip';
import { UsersListPage } from '../users/UsersListPage';
import { useAuth } from '../auth/AuthProvider';
import { SectionCard } from '../users/parts';

// The two place workspaces of phase 5B, section 4: one petrol station and one
// registration office, each as a few tabs. The municipality manager reaches
// them from «إدارة المحطات»; the supervisor and the office manager from
// «محطتي» and «مكتبي». The same tabs, so nobody learns two layouts.

function Big({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: ReactNode }) {
  return (
    <div className="rounded-md bg-surface p-4 shadow-sm">
      <p className="text-[14px] font-bold text-ink-soft lg:text-[12px]">{label}</p>
      <p className="mt-1.5 text-[32px] font-extrabold leading-none tabular-nums text-ink lg:text-[28px]">
        {value}
        {unit && <span className="ms-1.5 text-[15px] font-bold text-ink-soft lg:text-[13px]">{unit}</span>}
      </p>
      {note && <div className="mt-2 text-[14px] text-ink-soft lg:text-[12px]">{note}</div>}
    </div>
  );
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function useToday(report: 'station' | 'office', params: Record<string, string>) {
  const today = tripoliToday();
  return useQuery({
    queryKey: ['ops-report', 'today', report, params],
    queryFn: async () =>
      (await apiClient.get<OpsReport>(`/ops-reports/${report}`, { params: { ...params, from: today, to: addDays(today, 0) } })).data,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ── a petrol station ───────────────────────────────────────────────────

export function StationWorkspace({
  stationId,
  stationName,
  overview,
  staffTitle,
  staffEmpty,
  createParams,
}: {
  stationId: string;
  stationName: string;
  /** What sits on «نظرة عامة» below the day's figures: the form, the fuel types, the archive. */
  overview: ReactNode;
  staffTitle: string;
  staffEmpty: string;
  createParams: Record<string, string>;
}) {
  const { hasPermission } = useAuth();
  const canFuel = hasPermission('fuel_stock:read') || hasPermission('fuel_stock:read_visible');
  const canReports = hasPermission('reports:view');
  const tabs: TabDef[] = [
    { key: 'overview', label: 'نظرة عامة' },
    { key: 'staff', label: 'الموظفون' },
    ...(canFuel ? [{ key: 'fuel', label: 'الوقود والمخزون' }] : []),
    ...(canReports ? [{ key: 'reports', label: 'التقارير' }] : []),
  ];
  const [tab, setTab] = useTab(tabs);
  const today = useToday('station', { stationId });

  const days = today.data?.tables.find((t) => t.id === 'days')?.rows ?? [];
  const fillUps = days.reduce((t, r) => t + Number(r.count ?? 0), 0);
  const liters = days.reduce((t, r) => t + Number(r.liters ?? 0), 0);
  const flags = today.data?.tables.find((t) => t.id === 'exceptions')?.rows ?? [];
  const overrides = flags.reduce((t, r) => t + Number(r.overrides ?? 0) + Number(r.exceptions ?? 0), 0);
  const mismatches = today.data?.tables.find((t) => t.id === 'mismatches')?.rows.length ?? 0;

  return (
    <div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} label={`${stationName}: أقسام`} />

      <TabPanel tab="overview" value={tab}>
        {canReports && (
          <section aria-label="اليوم" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Big label="تعبئات اليوم" value={nf.format(fillUps)} />
            <Big label="لترات اليوم" value={nf.format(liters)} unit="لتر" />
            <Big
              label="استثناءات وتجاوزات اليوم"
              value={nf.format(overrides)}
              note={overrides > 0 ? <StatusPill variant="warn" size="md">راجعها في التقارير</StatusPill> : undefined}
            />
            <Big
              label="اختلاف نوع الوقود"
              value={nf.format(mismatches)}
              note={mismatches > 0 ? <StatusPill variant="warn" size="md">تنبيه</StatusPill> : undefined}
            />
          </section>
        )}
        <StockStrip stationId={stationId} />
        {overview}
      </TabPanel>

      <TabPanel tab="staff" value={tab}>
        <UsersListPage
          basePath="/people"
          fixedPlaceId={stationId}
          title={staffTitle}
          createParams={createParams}
          emptyText={staffEmpty}
        />
      </TabPanel>

      {canFuel && (
        <TabPanel tab="fuel" value={tab}>
          <FuelStockPanel stationId={stationId} stationName={stationName} />
        </TabPanel>
      )}

      {canReports && (
        <TabPanel tab="reports" value={tab}>
          <OpsReportPanel report="station" fixedStationId={stationId} />
        </TabPanel>
      )}
    </div>
  );
}

// ── a registration office ──────────────────────────────────────────────

export function OfficeWorkspace({
  officeId,
  officeName,
  overview,
  staffTitle,
  staffEmpty,
  createParams,
}: {
  officeId: string;
  officeName: string;
  overview: ReactNode;
  staffTitle: string;
  staffEmpty: string;
  createParams: Record<string, string>;
}) {
  const { hasPermission } = useAuth();
  const canStock = hasPermission('card_stock:read');
  const canDesks = hasPermission('registration_desks:manage');
  const canReports = hasPermission('registration_reports:view');
  const tabs: TabDef[] = [
    { key: 'overview', label: 'نظرة عامة' },
    { key: 'staff', label: 'الموظفون' },
    ...(canStock ? [{ key: 'cards', label: 'البطاقات والمخزون' }] : []),
    ...(canDesks ? [{ key: 'desks', label: 'المكاتب والطابعات' }] : []),
  ];
  const [tab, setTab] = useTab(tabs);
  const today = useToday('office', { officeId });

  const summary = today.data?.tables.find((t) => t.id === 'office')?.rows[0];
  const employees = today.data?.tables.find((t) => t.id === 'employees')?.rows ?? [];
  const stock = today.data?.tables.find((t) => t.id === 'card-stock')?.rows ?? [];
  const unaccounted = stock.reduce((t, r) => t + Number(r.unaccounted ?? 0), 0);
  const stockWord = unaccounted > 0 ? 'بطاقات غير مبرَّرة' : stock.length === 0 ? 'لم يُسجَّل جرد بعد' : 'مطابق';

  return (
    <div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} label={`${officeName}: أقسام`} />

      <TabPanel tab="overview" value={tab}>
        {canReports && (
          <>
            <section aria-label="اليوم" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Big label="بطاقات صدرت اليوم" value={nf.format(Number(summary?.cards ?? 0))} />
              <Big label="مركبات سُجّلت اليوم" value={nf.format(Number(summary?.vehicles ?? 0))} />
              <Big
                label="بطاقات تالفة اليوم"
                value={nf.format(Number(summary?.wasted ?? 0))}
                note={Number(summary?.wasted ?? 0) > 0 ? <StatusPill variant="warn" size="md">أخطاء طباعة</StatusPill> : undefined}
              />
              <Big
                label="مخزون البطاقات"
                value={nf.format(unaccounted)}
                unit="غير مبرَّرة"
                note={<StatusPill variant={unaccounted > 0 ? 'danger' : stock.length === 0 ? 'neutral' : 'ok'} size="md">{stockWord}</StatusPill>}
              />
            </section>

            <SectionCard title="نشاط الموظفين اليوم">
              {employees.length === 0 ? (
                <p className="text-[16px] text-ink-soft lg:text-[14px]">لا موظفين مرتبطون بهذا المكتب بعد.</p>
              ) : (
                <ul className="divide-y divide-line" data-testid="office-employee-activity">
                  {employees.map((e) => (
                    <li key={String(e.employeeId)} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0">
                        <Link
                          to={`/reports/registration/employees/${String(e.employeeId)}`}
                          className="text-[17px] font-bold text-primary hover:underline lg:text-[14px]"
                        >
                          {String(e.employee)}
                        </Link>
                        <p className="text-[14px] text-ink-soft lg:text-[12px]">
                          آخر دخول: {e.lastLogin ? stamp(String(e.lastLogin)) : 'لم يدخل بعد'}
                        </p>
                      </div>
                      <p className="flex flex-wrap items-center gap-2 text-[15px] text-ink lg:text-[13px]">
                        <span>مركبات <strong className="tabular-nums">{nf.format(Number(e.vehicles ?? 0))}</strong></span>
                        <span>بطاقات <strong className="tabular-nums">{nf.format(Number(e.cards ?? 0))}</strong></span>
                        {Number(e.failed ?? 0) > 0 && (
                          <StatusPill variant="warn" size="md">{nf.format(Number(e.failed))} طباعة فاشلة</StatusPill>
                        )}
                        {e.active === 'موقوف' && <StatusPill variant="neutral" size="md">موقوف</StatusPill>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </>
        )}
        {overview}
      </TabPanel>

      <TabPanel tab="staff" value={tab}>
        <UsersListPage
          basePath="/people"
          fixedPlaceId={officeId}
          title={staffTitle}
          createParams={createParams}
          emptyText={staffEmpty}
        />
      </TabPanel>

      {canStock && (
        <TabPanel tab="cards" value={tab}>
          <Card className="p-4">
            <CardStockPanel fixedOfficeId={officeId} />
          </Card>
          {canReports && <OpsReportPanel report="office" fixedOfficeId={officeId} />}
        </TabPanel>
      )}

      {canDesks && (
        <TabPanel tab="desks" value={tab}>
          <SectionCard title="المكاتب والطابعات" description="مكتب الموظف والطابعة المتصلة به؛ كل بطاقة تسجّل المكتب الذي طُبعت عليه.">
            <RegistrationDesksEditor registrationStationId={officeId} />
          </SectionCard>
        </TabPanel>
      )}
    </div>
  );
}
