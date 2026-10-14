import { useEffect, useMemo, useState } from 'react';
import { usePersistedState } from '../../lib/usePersistedState';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { downloadCsv } from '../../lib/csv';
import { formatDateTime } from '../../lib/dateFormat';
import { formatLicensePlate } from '../../lib/libyanFormats';
import { fuelTypeLabel } from '../../lib/labels';
import { useAuth } from '../auth/AuthProvider';
import { Pagination } from '../../components/Pagination';
import { StationSelect } from '../../components/StationSelect';
import { DateField } from '../../components/DateField';
import { LtrText } from '../../components/LtrText';
import { PageHeader } from '../../components/design/PageHeader';
import { SkeletonRows } from '../../components/design/Skeleton';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { TabPanel, Tabs, useTab, type TabDef } from '../../components/design/Tabs';
import { RULE_VIOLATION_MESSAGES } from '../fillups/ruleViolationMessages';
import type { RuleFailureReason } from '@fuel-tracking/shared-types';

const TAKE = 25;

const selectClass =
  'h-11 rounded-sm bg-surface-alt px-3 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60 lg:h-10 lg:text-[13px]';
const labelClass = 'mb-1 block text-[14px] font-bold text-ink-soft lg:text-[12px]';

interface ExceptionRow {
  id: string;
  occurredAt: string;
  stationId: string;
  station: string;
  plate: string | null;
  type: string;
  typeId: string;
  rule: string | null;
  reason: string;
  employeeId: string;
  employee: string;
  fuelType: string;
  liters: number;
  overLimit: boolean;
  stationFlagged: boolean;
}
interface ListResponse {
  range: { from: string; to: string };
  total: number;
  rows: ExceptionRow[];
}
interface StationRowData {
  stationId: string;
  station: string;
  stationNumber: string;
  company: string;
  count: number;
  overLimit: number;
  daysOverThreshold: number;
  threshold: number;
  flagged: boolean;
}
interface ByStationResponse {
  range: { from: string; to: string };
  municipalities: Array<{ municipalityId: string; municipality: string; count: number; flaggedStations: number; stations: number }> | null;
  threshold?: number;
  stations: StationRowData[] | null;
}
interface SettingsResponse {
  global: { strictLimit: boolean; stationDailyThreshold: number };
  municipality: { strictLimit: boolean | null; stationDailyThreshold: number | null } | null;
  effective: { strictLimit: boolean; stationDailyThreshold: number };
}
interface ExceptionTypeRow {
  id: string;
  name: string;
}

function ruleText(rule: string | null): string {
  if (!rule) return '—';
  return RULE_VIOLATION_MESSAGES[rule as RuleFailureReason] ?? rule;
}

// «الاستثناءات»: every use of an exception type, in the supervisor's station, in
// the municipality manager's municipality (station by station), and per
// municipality for the super admin. There is no approval step: a use is
// recorded at once, flagged when it goes past its type's daily limit, and a
// station with an unreasonable number in a day is flagged too (with a word,
// never colour alone).
export function ExceptionsPage() {
  const { user, hasPermission } = useAuth();
  const canViewAllStations = hasPermission('reports:view_all_stations');
  const canByStation = hasPermission('reports:municipality');
  const ownStation = user?.stationScope[0] ?? null;

  const tabs: TabDef[] = [{ key: 'list', label: 'القائمة' }, ...(canByStation ? [{ key: 'stations', label: 'حسب المحطة' }] : [])];
  const [tab, setTab] = useTab(tabs);

  const [stationId, setStationId] = useState(canViewAllStations || canByStation ? '' : (ownStation?.stationId ?? ''));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Remembered for this person on this device.
  const remember = `fuel.exceptions.${user?.id ?? 'anon'}`;
  const [typeId, setTypeId] = usePersistedState(`${remember}.type`, '');
  const [employeeId, setEmployeeId] = usePersistedState(`${remember}.employee`, '');
  const [flaggedOnly, setFlaggedOnly] = usePersistedState(`${remember}.flagged`, false);
  const [skip, setSkip] = useState(0);
  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setSkip(0);
  };

  const params = {
    stationId: stationId || undefined,
    from: from || undefined,
    to: to || undefined,
    typeId: typeId || undefined,
    employeeId: employeeId || undefined,
    flaggedOnly: flaggedOnly || undefined,
  };
  const list = useQuery({
    queryKey: ['exceptions', 'list', params, skip],
    queryFn: async () => (await apiClient.get<ListResponse>('/exceptions', { params: { ...params, skip, take: TAKE } })).data,
  });
  const types = useQuery({
    queryKey: ['exceptions', 'types'],
    queryFn: async () => (await apiClient.get<ExceptionTypeRow[]>('/fillups/exception-types')).data,
  });

  // The employees seen so far in this list, to filter by.
  const employees = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of list.data?.rows ?? []) map.set(row.employeeId, row.employee);
    return [...map.entries()];
  }, [list.data]);

  async function exportCsv() {
    const res = await apiClient.get<ListResponse>('/exceptions', { params: { ...params, skip: 0, take: 100 } });
    downloadCsv(
      `exceptions_${res.data.range.from}_${res.data.range.to}.csv`,
      ['الوقت', 'المحطة', 'اللوحة', 'النوع', 'القاعدة', 'السبب', 'الموظف', 'الوقود', 'اللترات', 'فوق حد النوع'],
      res.data.rows.map((r) => [
        formatDateTime(r.occurredAt),
        r.station,
        r.plate,
        r.type,
        ruleText(r.rule),
        r.reason,
        r.employee,
        fuelTypeLabel(r.fuelType as never),
        r.liters,
        r.overLimit ? 'نعم' : 'لا',
      ]),
    );
  }

  return (
    <div>
      <PageHeader
        title="الاستثناءات"
        subtitle="كل استخدام لنوع استثناء: متى ولماذا ومن سجّله، وما تجاوز حدّه اليومي."
        actions={
          tab === 'list' ? (
            <PillButton variant="secondary" size="sm" onClick={exportCsv} data-testid="exceptions-export-csv">
              تنزيل CSV
            </PillButton>
          ) : undefined
        }
      />
      {canByStation && <Tabs tabs={tabs} value={tab} onChange={setTab} label="عرض الاستثناءات" />}

      <TabPanel tab="list" value={tab}>
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={labelClass}>المحطة</label>
              <StationSelect
                value={stationId}
                onChange={reset(setStationId)}
                allowAllOption={canViewAllStations || canByStation}
                disabled={!canViewAllStations && !canByStation}
                className={`w-52 ${selectClass}`}
              />
            </div>
            <div>
              <label className={labelClass}>من تاريخ</label>
              <DateField value={from} onChange={reset(setFrom)} inputClassName={`w-44 pe-9 ${selectClass}`} />
            </div>
            <div>
              <label className={labelClass}>إلى تاريخ</label>
              <DateField value={to} onChange={reset(setTo)} inputClassName={`w-44 pe-9 ${selectClass}`} />
            </div>
            <div>
              <label className={labelClass}>نوع الاستثناء</label>
              <select value={typeId} onChange={(e) => reset(setTypeId)(e.target.value)} className={`w-48 ${selectClass}`} data-testid="exceptions-filter-type">
                <option value="">كل الأنواع</option>
                {types.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>الموظف</label>
              <select value={employeeId} onChange={(e) => reset(setEmployeeId)(e.target.value)} className={`w-48 ${selectClass}`} data-testid="exceptions-filter-employee">
                <option value="">كل الموظفين</option>
                {employees.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex min-h-[44px] items-center gap-2 text-[15px] font-bold text-ink lg:text-[13px]">
              <input type="checkbox" checked={flaggedOnly} onChange={(e) => reset(setFlaggedOnly)(e.target.checked)} data-testid="exceptions-filter-flagged" />
              ما تجاوز الحد فقط
            </label>
          </div>
        </Card>

        {list.isLoading && (
          <Card>
            <SkeletonRows rows={6} />
          </Card>
        )}
        {list.isError && <p className="text-[15px] text-danger">تعذّر تحميل الاستثناءات.</p>}
        {list.data && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-[14px] lg:text-[12.5px]" data-testid="exceptions-table">
                <thead>
                  <tr className="bg-surface-alt text-[13px] font-bold text-ink-soft lg:text-[12px]">
                    <th className="px-[18px] py-2.5 text-start">الوقت</th>
                    <th className="px-[18px] py-2.5 text-start">المحطة</th>
                    <th className="px-[18px] py-2.5 text-start">المركبة</th>
                    <th className="px-[18px] py-2.5 text-start">النوع</th>
                    <th className="px-[18px] py-2.5 text-start">القاعدة التي تجاوزها</th>
                    <th className="px-[18px] py-2.5 text-start">السبب</th>
                    <th className="px-[18px] py-2.5 text-start">الموظف</th>
                    <th className="px-[18px] py-2.5 text-start">تنبيه</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.rows.map((r) => (
                    <tr key={r.id} className="border-b border-line-soft align-top last:border-0" data-testid="exceptions-row">
                      <td className="px-[18px] py-3">
                        <LtrText>{formatDateTime(r.occurredAt)}</LtrText>
                      </td>
                      <td className="px-[18px] py-3">{r.station}</td>
                      <td className="px-[18px] py-3">{r.plate ? <LtrText>{formatLicensePlate(r.plate)}</LtrText> : '—'}</td>
                      <td className="px-[18px] py-3">{r.type}</td>
                      <td className="px-[18px] py-3">{ruleText(r.rule)}</td>
                      <td className="px-[18px] py-3">{r.reason}</td>
                      <td className="px-[18px] py-3">{r.employee}</td>
                      <td className="px-[18px] py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {r.overLimit && <StatusPill variant="danger">فوق حد النوع اليومي</StatusPill>}
                          {r.stationFlagged && <StatusPill variant="warn">محطة مرتفعة الاستثناءات</StatusPill>}
                          {!r.overLimit && !r.stationFlagged && <span className="text-ink-faint">—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {list.data.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-[15px] text-ink-soft lg:text-[13px]">
                        لا توجد استثناءات مطابقة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-[18px] py-3">
              <Pagination skip={skip} take={TAKE} total={list.data.total} onSkipChange={setSkip} />
            </div>
          </Card>
        )}
      </TabPanel>

      {canByStation && (
        <TabPanel tab="stations" value={tab}>
          <ByStationPanel
            onOpenStation={(id) => {
              setStationId(id);
              setSkip(0);
              setTab('list');
            }}
          />
        </TabPanel>
      )}
    </div>
  );
}

// Station by station for one municipality, with its settings.
function ByStationPanel({ onOpenStation }: { onOpenStation: (stationId: string) => void }) {
  const { hasPermission } = useAuth();
  const canSettings = hasPermission('exception_settings:manage');
  const [municipalityId, setMunicipalityId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const overview = useQuery({
    queryKey: ['exceptions', 'by-station', 'municipalities', from, to],
    queryFn: async () =>
      (await apiClient.get<ByStationResponse>('/exceptions/by-station', { params: { from: from || undefined, to: to || undefined } })).data,
  });
  const municipalities = overview.data?.municipalities ?? [];
  useEffect(() => {
    if (!municipalityId && municipalities.length === 1) setMunicipalityId(municipalities[0]!.municipalityId);
  }, [municipalities, municipalityId]);

  const stations = useQuery({
    queryKey: ['exceptions', 'by-station', municipalityId, from, to],
    enabled: !!municipalityId,
    queryFn: async () =>
      (await apiClient.get<ByStationResponse>('/exceptions/by-station', { params: { municipalityId, from: from || undefined, to: to || undefined } })).data,
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelClass}>البلدية</label>
            <select
              value={municipalityId}
              onChange={(e) => setMunicipalityId(e.target.value)}
              className={`w-56 ${selectClass}`}
              data-testid="exceptions-municipality"
            >
              <option value="">اختر البلدية</option>
              {municipalities.map((m) => (
                <option key={m.municipalityId} value={m.municipalityId}>
                  {m.municipality} — {m.count} استثناء{m.flaggedStations > 0 ? ` — ${m.flaggedStations} محطة مرتفعة` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>من تاريخ</label>
            <DateField value={from} onChange={setFrom} inputClassName={`w-44 pe-9 ${selectClass}`} />
          </div>
          <div>
            <label className={labelClass}>إلى تاريخ</label>
            <DateField value={to} onChange={setTo} inputClassName={`w-44 pe-9 ${selectClass}`} />
          </div>
        </div>
      </Card>

      {stations.data?.stations && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[14px] lg:text-[12.5px]" data-testid="exceptions-by-station">
              <thead>
                <tr className="bg-surface-alt text-[13px] font-bold text-ink-soft lg:text-[12px]">
                  <th className="px-[18px] py-2.5 text-start">المحطة</th>
                  <th className="px-[18px] py-2.5 text-start">الشركة</th>
                  <th className="px-[18px] py-2.5 text-start">عدد الاستثناءات</th>
                  <th className="px-[18px] py-2.5 text-start">فوق حد النوع</th>
                  <th className="px-[18px] py-2.5 text-start">أيام فوق الحد غير المعقول ({stations.data.threshold ?? ''})</th>
                  <th className="px-[18px] py-2.5 text-start">الحالة</th>
                  <th className="px-[18px] py-2.5 text-start"></th>
                </tr>
              </thead>
              <tbody>
                {stations.data.stations.map((s) => (
                  <tr key={s.stationId} className="border-b border-line-soft last:border-0" data-testid={`exceptions-station-${s.stationId}`}>
                    <td className="px-[18px] py-3 font-bold text-ink">{s.station}</td>
                    <td className="px-[18px] py-3 text-ink-soft">{s.company}</td>
                    <td className="px-[18px] py-3 tabular-nums">{s.count}</td>
                    <td className="px-[18px] py-3 tabular-nums">{s.overLimit}</td>
                    <td className="px-[18px] py-3 tabular-nums">{s.daysOverThreshold}</td>
                    <td className="px-[18px] py-3">
                      {s.flagged ? <StatusPill variant="danger">محطة مرتفعة الاستثناءات</StatusPill> : <StatusPill variant="ok">ضمن المعتاد</StatusPill>}
                    </td>
                    <td className="px-[18px] py-3">
                      <PillButton size="sm" variant="secondary" onClick={() => onOpenStation(s.stationId)}>
                        عرض الاستثناءات
                      </PillButton>
                    </td>
                  </tr>
                ))}
                {stations.data.stations.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-[15px] text-ink-soft">لا توجد محطات.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {canSettings && municipalityId && <MunicipalitySettingsCard municipalityId={municipalityId} />}
    </div>
  );
}

// «منع تجاوز حد الاستثناءات» and the unreasonable-station threshold, for one
// municipality. The municipality's value wins over the general one.
export function MunicipalitySettingsCard({ municipalityId }: { municipalityId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['exceptions', 'settings', municipalityId],
    queryFn: async () => (await apiClient.get<SettingsResponse>('/exceptions/settings', { params: { municipalityId } })).data,
  });
  const [strict, setStrict] = useState<'inherit' | 'on' | 'off'>('inherit');
  const [threshold, setThreshold] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!query.data?.municipality) return;
    const m = query.data.municipality;
    setStrict(m.strictLimit === null ? 'inherit' : m.strictLimit ? 'on' : 'off');
    setThreshold(m.stationDailyThreshold === null ? '' : String(m.stationDailyThreshold));
  }, [query.data]);

  const save = useMutation({
    mutationFn: async () =>
      apiClient.patch(`/exceptions/settings/municipality/${municipalityId}`, {
        strictLimit: strict === 'inherit' ? null : strict === 'on',
        stationDailyThreshold: threshold.trim() === '' ? null : Number(threshold),
      }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['exceptions', 'settings', municipalityId] });
    },
  });

  const general = query.data?.global;
  return (
    <Card className="p-4" data-testid="exception-settings-card">
      <h2 className="text-[18px] font-extrabold text-ink lg:text-[15px]">حدود الاستثناءات لهذه البلدية</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="exc-strict">منع تجاوز حد الاستثناءات</label>
          <select
            id="exc-strict"
            value={strict}
            onChange={(e) => {
              setStrict(e.target.value as 'inherit' | 'on' | 'off');
              setSaved(false);
            }}
            className={`w-full ${selectClass}`}
            data-testid="exception-settings-strict"
          >
            <option value="inherit">حسب الإعداد العام ({general?.strictLimit ? 'مفعّل' : 'غير مفعّل'})</option>
            <option value="on">مفعّل: يُرفض التجاوز</option>
            <option value="off">غير مفعّل: يُسمح ويُبلَّغ المشرف</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="exc-threshold">عدد الاستثناءات اليومي غير المعقول لمحطة</label>
          <input
            id="exc-threshold"
            type="number"
            min={1}
            value={threshold}
            onChange={(e) => {
              setThreshold(e.target.value);
              setSaved(false);
            }}
            placeholder={general ? `الإعداد العام: ${general.stationDailyThreshold}` : ''}
            className={`w-full ${selectClass}`}
            data-testid="exception-settings-threshold"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <PillButton size="field" onClick={() => save.mutate()} disabled={save.isPending} data-testid="exception-settings-save">
          {save.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
        </PillButton>
        {saved && <span className="text-[15px] font-bold text-ok">تم الحفظ.</span>}
        {save.isError && <span className="text-[15px] font-bold text-danger">تعذّر الحفظ.</span>}
      </div>
    </Card>
  );
}
