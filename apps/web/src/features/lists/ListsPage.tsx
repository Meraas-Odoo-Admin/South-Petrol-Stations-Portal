import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../../components/design/PageHeader';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { TabPanel, Tabs, useTab, type TabDef } from '../../components/design/Tabs';
import { VehicleTypesAdminPage } from '../admin/VehicleTypesAdminPage';
import { useMunicipalityList } from '../places/placesShared';
import { RULE_CHECK_LABELS } from '../fillups/ruleViolationMessages';
import { adminErrorMessage } from '../admin/adminErrors';
import type { RuleFailureReason } from '@fuel-tracking/shared-types';

interface ExceptionTypeRow {
  id: string;
  key: string;
  name: string;
  requiresProof: boolean;
  isActive: boolean;
  overridableRules: RuleFailureReason[];
  dailyLimitPerStation: number | null;
  municipalityId: string | null;
}

const RULES = Object.keys(RULE_CHECK_LABELS) as RuleFailureReason[];

const inputClass =
  'h-11 rounded-sm bg-surface-alt px-3 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-accent lg:h-9 lg:text-[13px]';
const labelClass = 'mb-1 block text-[14px] font-bold text-ink-soft lg:text-[12px]';

// «القوائم»: the lookup lists in one place. Exception types are defined by the
// super admin (for everyone) and by a municipality manager (for their own
// municipality): the rules each may override, and a daily limit per station.
// Vehicle types stay a super-admin list.
export function ListsPage() {
  const { hasPermission } = useAuth();
  const canExceptions = hasPermission('exception_types:manage');
  const canVehicleTypes = hasPermission('vehicle_types:manage');
  const tabs: TabDef[] = [
    ...(canExceptions ? [{ key: 'exceptions', label: 'أنواع الاستثناءات' }] : []),
    ...(canVehicleTypes ? [{ key: 'vehicles', label: 'أنواع المركبات' }] : []),
  ];
  const [tab, setTab] = useTab(tabs.length > 0 ? tabs : [{ key: 'none', label: '' }]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="القوائم" subtitle="الأنواع التي تُختار منها القيم في المنظومة: الاستثناءات والمركبات." />
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} label="القوائم" />}
      {canExceptions && (
        <TabPanel tab="exceptions" value={tab}>
          <ExceptionTypesPanel />
        </TabPanel>
      )}
      {canVehicleTypes && (
        <TabPanel tab="vehicles" value={tab}>
          <VehicleTypesAdminPage />
        </TabPanel>
      )}
    </div>
  );
}

function ExceptionTypesPanel() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = hasPermission('municipalities:manage');
  const municipalities = useMunicipalityList();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [rules, setRules] = useState<RuleFailureReason[]>([]);
  const [municipalityId, setMunicipalityId] = useState('');
  const [requiresProof, setRequiresProof] = useState(false);

  const list = useQuery({
    queryKey: ['exception-types', 'all'],
    queryFn: async () => (await apiClient.get<ExceptionTypeRow[]>('/fillups/exception-types/all')).data,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['exception-types'] });
  const municipalityName = (id: string | null) => (id ? (municipalities.data?.find((m) => m.id === id)?.name ?? 'بلدية') : 'كل البلديات');

  const create = useMutation({
    mutationFn: () =>
      apiClient.post('/fillups/exception-types', {
        key: key.trim(),
        name: name.trim(),
        requiresProof,
        overridableRules: rules,
        ...(limit.trim() ? { dailyLimitPerStation: Number(limit) } : {}),
        ...(municipalityId ? { municipalityId } : {}),
      }),
    onSuccess: () => {
      setError(null);
      setShowCreate(false);
      setKey('');
      setName('');
      setLimit('');
      setRules([]);
      setMunicipalityId('');
      setRequiresProof(false);
      invalidate();
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذر إضافة نوع الاستثناء — تحقّق من عدم تكرار المفتاح.')),
  });

  const update = useMutation({
    mutationFn: (p: { id: string } & Partial<Pick<ExceptionTypeRow, 'name' | 'requiresProof' | 'isActive' | 'overridableRules' | 'dailyLimitPerStation'>>) => {
      const { id, ...body } = p;
      return apiClient.patch(`/fillups/exception-types/${id}`, body);
    },
    onSuccess: invalidate,
    onError: (err) => setError(adminErrorMessage(err, 'تعذر تحديث نوع الاستثناء.')),
  });

  const toggleRule = (rule: RuleFailureReason) =>
    setRules((current) => (current.includes(rule) ? current.filter((r) => r !== rule) : [...current, rule]));

  return (
    <div className="space-y-4" data-testid="exception-types-panel">
      {showCreate && (
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>المفتاح (لا يتغيّر لاحقًا)</label>
              <input value={key} onChange={(e) => setKey(e.target.value)} dir="ltr" className={`w-full ${inputClass}`} data-testid="exc-type-key" />
            </div>
            <div>
              <label className={labelClass}>الاسم بالعربية</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={`w-full ${inputClass}`} data-testid="exc-type-name" />
            </div>
            <div>
              <label className={labelClass}>الحد اليومي لكل محطة (اتركه فارغًا لعدم التحديد)</label>
              <input
                type="number"
                min={1}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className={`w-full ${inputClass}`}
                data-testid="exc-type-limit"
              />
            </div>
            {isSuper && (
              <div>
                <label className={labelClass}>البلدية</label>
                <select value={municipalityId} onChange={(e) => setMunicipalityId(e.target.value)} className={`w-full ${inputClass}`}>
                  <option value="">كل البلديات</option>
                  {municipalities.data?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <fieldset className="mt-3">
            <legend className={labelClass}>القواعد التي يتجاوزها (بلا اختيار = أي قاعدة)</legend>
            <div className="flex flex-wrap gap-3">
              {RULES.map((rule) => (
                <label key={rule} className="flex min-h-[44px] items-center gap-2 text-[14px] text-ink lg:text-[12.5px]">
                  <input type="checkbox" checked={rules.includes(rule)} onChange={() => toggleRule(rule)} />
                  {RULE_CHECK_LABELS[rule]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-2 flex min-h-[44px] items-center gap-2 text-[14px] text-ink lg:text-[12.5px]">
            <input type="checkbox" checked={requiresProof} onChange={(e) => setRequiresProof(e.target.checked)} />
            يتطلب مرجع إثبات
          </label>
          <div className="mt-3">
            <PillButton disabled={!key.trim() || !name.trim() || create.isPending} onClick={() => create.mutate()} data-testid="exc-type-create">
              إضافة
            </PillButton>
          </div>
        </Card>
      )}

      {error && <p className="text-[15px] font-bold text-danger lg:text-[13px]">{error}</p>}

      <Card>
        <CardHeader
          title="أنواع الاستثناءات"
          subtitle={list.data ? `${list.data.length} نوع` : undefined}
          action={
            <PillButton size="sm" onClick={() => setShowCreate((s) => !s)}>
              {showCreate ? 'إلغاء' : 'نوع جديد +'}
            </PillButton>
          }
        />
        {list.isLoading && <p className="p-4 text-[15px] text-ink-soft">جارٍ التحميل…</p>}
        {list.isError && <p className="p-4 text-[15px] text-danger">تعذّر تحميل أنواع الاستثناءات.</p>}
        {list.data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[14px] lg:text-[12.5px]">
              <thead>
                <tr className="bg-surface-alt text-[13px] font-bold text-ink-soft lg:text-[12px]">
                  <th className="px-[18px] py-2.5 text-start">الاسم</th>
                  <th className="px-[18px] py-2.5 text-start">النطاق</th>
                  <th className="px-[18px] py-2.5 text-start">القواعد</th>
                  <th className="px-[18px] py-2.5 text-start">الحد اليومي لكل محطة</th>
                  <th className="px-[18px] py-2.5 text-start">الحالة</th>
                  <th className="px-[18px] py-2.5 text-start"></th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((t) => (
                  <tr key={t.id} className="border-b border-line-soft last:border-0" data-testid={`exc-type-${t.key}`}>
                    <td className="px-[18px] py-3">
                      <p className="font-bold text-ink">{t.name}</p>
                      <CodeText>{t.key}</CodeText>
                    </td>
                    <td className="px-[18px] py-3 text-ink-soft">{municipalityName(t.municipalityId)}</td>
                    <td className="px-[18px] py-3 text-ink-soft">
                      {t.overridableRules.length === 0 ? 'أي قاعدة' : t.overridableRules.map((r) => RULE_CHECK_LABELS[r]).join('، ')}
                    </td>
                    <td className="px-[18px] py-3">
                      <input
                        type="number"
                        min={1}
                        defaultValue={t.dailyLimitPerStation ?? ''}
                        placeholder="بلا حد"
                        onBlur={(e) => {
                          const next = e.target.value.trim() === '' ? null : Number(e.target.value);
                          if (next !== t.dailyLimitPerStation) update.mutate({ id: t.id, dailyLimitPerStation: next });
                        }}
                        className={`w-28 ${inputClass}`}
                        aria-label={`الحد اليومي لنوع ${t.name}`}
                      />
                    </td>
                    <td className="px-[18px] py-3">
                      <StatusPill variant={t.isActive ? 'ok' : 'neutral'}>{t.isActive ? 'فعّال' : 'موقوف'}</StatusPill>
                    </td>
                    <td className="px-[18px] py-3">
                      <PillButton variant="ghost" size="sm" onClick={() => update.mutate({ id: t.id, isActive: !t.isActive })}>
                        {t.isActive ? 'إيقاف' : 'تفعيل'}
                      </PillButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
