import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../auth/AuthProvider';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { SkeletonRows } from '../../components/design/Skeleton';
import { TabPanel, Tabs, useTab, type TabDef } from '../../components/design/Tabs';
import { useMunicipalityList } from '../places/placesShared';
import { RULE_CHECK_LABELS } from '../fillups/ruleViolationMessages';
import { adminErrorMessage } from '../admin/adminErrors';
import { focusField } from '../../lib/focusField';
import { Notice } from '../users/parts';
import type { RuleFailureReason } from '@fuel-tracking/shared-types';
import { Pagination } from '../../components/Pagination';
import { useClientPage } from '../../lib/pageSize';

interface ExceptionTypeRow {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  overridableRules: RuleFailureReason[];
  dailyLimitPerStation: number | null;
  municipalityId: string | null;
}

interface VehicleTypeRow {
  id: string;
  name: string;
  isActive: boolean;
}

const RULES = Object.keys(RULE_CHECK_LABELS) as RuleFailureReason[];

const inputClass =
  'h-11 w-full rounded-sm bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark lg:h-10 lg:text-[14px]';
const labelClass = 'mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]';
const hintClass = 'mt-1 text-[13px] text-ink-soft lg:text-[12px]';

// «القوائم» (Phase 7: a tab of «الإدارة», no longer its own menu item): the
// lists the rest of the system picks values from. Exception types are defined
// by the super admin (for everyone) and by a municipality manager (for their
// own municipality): the rules each may override and a daily limit per
// station. Vehicle types are a super-admin list. Each list has the same three
// actions: add, edit, archive (and restore). Nothing is ever deleted: an
// archived type is no longer offered, and every row that used it keeps it.
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
      <p className="text-[15px] text-ink-soft lg:text-[13px]">الأنواع التي تُختار منها القيم في المنظومة: أنواع الاستثناءات وأنواع المركبات.</p>
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} label="القوائم" />}
      {canExceptions && (
        <TabPanel tab="exceptions" value={tab}>
          <ExceptionTypesPanel />
        </TabPanel>
      )}
      {canVehicleTypes && (
        <TabPanel tab="vehicles" value={tab}>
          <VehicleTypesPanel />
        </TabPanel>
      )}
    </div>
  );
}

// ── exception types ──────────────────────────────────────────────────

interface ExceptionDraft {
  name: string;
  limit: string;
  rules: RuleFailureReason[];
}

function ExceptionTypeFields({
  draft,
  onChange,
  idPrefix,
}: {
  draft: ExceptionDraft;
  onChange: (next: ExceptionDraft) => void;
  idPrefix: string;
}) {
  const toggleRule = (rule: RuleFailureReason) =>
    onChange({ ...draft, rules: draft.rules.includes(rule) ? draft.rules.filter((r) => r !== rule) : [...draft.rules, rule] });
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-name`} className={labelClass}>
          الاسم بالعربية
        </label>
        <input
          id={`${idPrefix}-name`}
          data-testid={`${idPrefix}-name`}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-limit`} className={labelClass}>
          الحد اليومي لكل محطة (استثناء في اليوم)
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${idPrefix}-limit`}
            data-testid={`${idPrefix}-limit`}
            type="number"
            min={1}
            inputMode="numeric"
            value={draft.limit}
            onChange={(e) => onChange({ ...draft, limit: e.target.value })}
            className={`${inputClass} max-w-[8rem] text-center`}
          />
          <span className="text-[15px] font-bold text-ink-soft lg:text-[13px]">استثناء في اليوم</span>
        </div>
        <p className={hintClass}>اتركه فارغًا إن لم يكن للنوع حد يومي.</p>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className={labelClass}>القواعد التي يتجاوزها (بلا اختيار = أي قاعدة)</legend>
        <div className="flex flex-wrap gap-x-4">
          {RULES.map((rule) => (
            <label key={rule} className="flex min-h-[44px] items-center gap-2 text-[15px] text-ink lg:text-[13px]">
              <input type="checkbox" className="h-5 w-5" checked={draft.rules.includes(rule)} onChange={() => toggleRule(rule)} />
              {RULE_CHECK_LABELS[rule]}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function limitFromDraft(limit: string): number | null {
  return limit.trim() === '' ? null : Number(limit);
}

function ExceptionTypesPanel() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = hasPermission('municipalities:manage');
  const municipalities = useMunicipalityList();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [key, setKey] = useState('');
  const [municipalityId, setMunicipalityId] = useState('');
  const [draft, setDraft] = useState<ExceptionDraft>({ name: '', limit: '', rules: [] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ExceptionDraft>({ name: '', limit: '', rules: [] });

  const list = useQuery({
    queryKey: ['exception-types', 'all'],
    queryFn: async () => (await apiClient.get<ExceptionTypeRow[]>('/fillups/exception-types/all')).data,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['exception-types'] });
  const excPage = useClientPage(list.data ?? []);
  const municipalityName = (id: string | null) => (id ? (municipalities.data?.find((m) => m.id === id)?.name ?? 'بلدية') : 'كل البلديات');

  const create = useMutation({
    mutationFn: () =>
      apiClient.post('/fillups/exception-types', {
        key: key.trim(),
        name: draft.name.trim(),
        overridableRules: draft.rules,
        ...(draft.limit.trim() ? { dailyLimitPerStation: Number(draft.limit) } : {}),
        ...(municipalityId ? { municipalityId } : {}),
      }),
    onSuccess: () => {
      setError(null);
      setSaved(`أُضيف نوع الاستثناء «${draft.name.trim()}».`);
      setShowCreate(false);
      setKey('');
      setDraft({ name: '', limit: '', rules: [] });
      setMunicipalityId('');
      invalidate();
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذر إضافة نوع الاستثناء — تحقّق من عدم تكرار المفتاح.')),
  });

  const update = useMutation({
    mutationFn: (p: { id: string; name?: string; isActive?: boolean; overridableRules?: RuleFailureReason[]; dailyLimitPerStation?: number | null }) => {
      const { id, ...body } = p;
      return apiClient.patch(`/fillups/exception-types/${id}`, body);
    },
    onSuccess: (_res, p) => {
      setError(null);
      setSaved(p.isActive === undefined ? 'حُفظت التعديلات.' : p.isActive ? 'استُعيد النوع، ويظهر من جديد عند التسجيل.' : 'أُرشف النوع، ولم يعد يظهر عند التسجيل. السجلات السابقة تبقى كما هي.');
      setEditingId(null);
      invalidate();
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذر تحديث نوع الاستثناء.')),
  });

  function submitCreate() {
    setError(null);
    setSaved(null);
    if (!key.trim()) {
      setError('اكتب المفتاح: كلمة إنجليزية قصيرة لا تتغيّر، مثل medical.');
      return focusField('exc-type-key');
    }
    if (!draft.name.trim()) {
      setError('اكتب اسم النوع بالعربية.');
      return focusField('exc-new-name');
    }
    create.mutate();
  }

  function submitEdit(row: ExceptionTypeRow) {
    setError(null);
    setSaved(null);
    if (!editDraft.name.trim()) {
      setError('اسم النوع مطلوب.');
      return focusField(`exc-edit-${row.key}-name`);
    }
    update.mutate({
      id: row.id,
      name: editDraft.name.trim(),
      overridableRules: editDraft.rules,
      dailyLimitPerStation: limitFromDraft(editDraft.limit),
    });
  }

  return (
    <div className="space-y-4" data-testid="exception-types-panel">
      {saved && <Notice kind="success">{saved}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {showCreate && (
        <Card className="p-4" data-testid="exc-type-create-card">
          <h3 className="mb-3 text-[18px] font-extrabold text-primary-dark lg:text-[15px]">نوع استثناء جديد</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="exc-type-key" className={labelClass}>
                المفتاح (بالإنجليزية، لا يتغيّر لاحقًا)
              </label>
              <input id="exc-type-key" value={key} onChange={(e) => setKey(e.target.value)} dir="ltr" className={inputClass} data-testid="exc-type-key" />
            </div>
            {isSuper && (
              <div>
                <label htmlFor="exc-type-municipality" className={labelClass}>
                  البلدية
                </label>
                <select id="exc-type-municipality" value={municipalityId} onChange={(e) => setMunicipalityId(e.target.value)} className={inputClass}>
                  <option value="">كل البلديات</option>
                  {municipalities.data?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <ExceptionTypeFields draft={draft} onChange={setDraft} idPrefix="exc-new" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <PillButton disabled={create.isPending} onClick={submitCreate} data-testid="exc-type-create">
              {create.isPending ? 'جارٍ الإضافة…' : 'إضافة النوع'}
            </PillButton>
            <PillButton variant="secondary" onClick={() => setShowCreate(false)}>
              إلغاء
            </PillButton>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="أنواع الاستثناءات"
          subtitle={list.data ? `${list.data.length} نوع` : undefined}
          action={
            !showCreate && (
              <PillButton size="sm" onClick={() => setShowCreate(true)} data-testid="exc-type-new">
                نوع جديد +
              </PillButton>
            )
          }
        />
        {list.isLoading && <SkeletonRows rows={4} />}
        {list.isError && <p className="p-4 text-[15px] text-danger-dark lg:text-[13px]">تعذّر تحميل أنواع الاستثناءات. أعد تحميل الصفحة.</p>}
        {list.data && list.data.length === 0 && <p className="p-4 text-[15px] text-ink-soft lg:text-[13px]">لا توجد أنواع بعد. أضف أول نوع بزر «نوع جديد».</p>}
        {list.data && list.data.length > 0 && (
          <ul className="divide-y divide-line-soft">
            {excPage.pageItems.map((t) =>
              editingId === t.id ? (
                <li key={t.id} className="bg-primary-100/50 p-4" data-testid={`exc-type-${t.key}`}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ExceptionTypeFields draft={editDraft} onChange={setEditDraft} idPrefix={`exc-edit-${t.key}`} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <PillButton size="sm" disabled={update.isPending} onClick={() => submitEdit(t)} data-testid={`exc-type-save-${t.key}`}>
                      حفظ التعديلات
                    </PillButton>
                    <PillButton size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                      إلغاء
                    </PillButton>
                  </div>
                </li>
              ) : (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 p-4" data-testid={`exc-type-${t.key}`}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[16px] font-bold text-ink lg:text-[14px]">
                      {t.name}
                      <StatusPill variant={t.isActive ? 'ok' : 'neutral'}>{t.isActive ? 'فعّال' : 'مؤرشف'}</StatusPill>
                    </p>
                    <p className="mt-0.5">
                      <CodeText>{t.key}</CodeText>
                    </p>
                    <dl className="mt-2 grid gap-x-6 gap-y-1 text-[14px] text-ink-soft sm:grid-cols-3 lg:text-[12.5px]">
                      <div>
                        <dt className="inline font-bold text-ink">النطاق: </dt>
                        <dd className="inline">{municipalityName(t.municipalityId)}</dd>
                      </div>
                      <div>
                        <dt className="inline font-bold text-ink">الحد اليومي: </dt>
                        <dd className="inline">{t.dailyLimitPerStation == null ? 'بلا حد' : `${t.dailyLimitPerStation} استثناء في اليوم لكل محطة`}</dd>
                      </div>
                      <div>
                        <dt className="inline font-bold text-ink">القواعد: </dt>
                        <dd className="inline">{t.overridableRules.length === 0 ? 'أي قاعدة' : t.overridableRules.map((r) => RULE_CHECK_LABELS[r]).join('، ')}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <PillButton
                      size="sm"
                      variant="secondary"
                      data-testid={`exc-type-edit-${t.key}`}
                      onClick={() => {
                        setSaved(null);
                        setEditingId(t.id);
                        setEditDraft({ name: t.name, limit: t.dailyLimitPerStation == null ? '' : String(t.dailyLimitPerStation), rules: t.overridableRules });
                      }}
                    >
                      تعديل
                    </PillButton>
                    <PillButton
                      size="sm"
                      variant="ghost"
                      data-testid={`exc-type-archive-${t.key}`}
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: t.id, isActive: !t.isActive })}
                    >
                      {t.isActive ? 'أرشفة' : 'استعادة'}
                    </PillButton>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
        <Pagination skip={excPage.skip} take={excPage.take} total={excPage.total} onSkipChange={excPage.setSkip} testId="exception-types-pager" />
      </Card>
    </div>
  );
}

// ── vehicle types ────────────────────────────────────────────────────

function VehicleTypesPanel() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'vehicle-types'],
    queryFn: async () => (await apiClient.get<VehicleTypeRow[]>('/vehicle-types')).data,
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'vehicle-types'] });
    queryClient.invalidateQueries({ queryKey: ['vehicle-types'] });
  };
  const typePage = useClientPage(data ?? []);

  const create = useMutation({
    mutationFn: () => apiClient.post('/vehicle-types', { name: newName.trim() }),
    onSuccess: () => {
      setError(null);
      setSaved(`أُضيف نوع المركبة «${newName.trim()}».`);
      setShowCreate(false);
      setNewName('');
      invalidate();
    },
    onError: () => setError('تعذر إضافة نوع المركبة — تحقّق من عدم تكرار الاسم.'),
  });

  const update = useMutation({
    mutationFn: (payload: { id: string; name?: string; isActive?: boolean }) =>
      apiClient.patch(`/vehicle-types/${payload.id}`, {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      }),
    onSuccess: (_res, p) => {
      setError(null);
      setSaved(p.isActive === undefined ? 'حُفظ الاسم الجديد.' : p.isActive ? 'استُعيد النوع، ويظهر من جديد عند التسجيل.' : 'أُرشف النوع، ولم يعد يظهر عند التسجيل. المركبات المسجّلة به تبقى كما هي.');
      setEditingId(null);
      invalidate();
    },
    onError: () => setError('تعذر تحديث نوع المركبة — تحقّق من عدم تكرار الاسم.'),
  });

  return (
    <div className="space-y-4" data-testid="vehicle-types-panel">
      {saved && <Notice kind="success">{saved}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {showCreate && (
        <Card className="p-4">
          <h3 className="mb-3 text-[18px] font-extrabold text-primary-dark lg:text-[15px]">نوع مركبة جديد</h3>
          <div className="max-w-sm">
            <label htmlFor="vehicle-type-new" className={labelClass}>
              اسم النوع
            </label>
            <input id="vehicle-type-new" data-testid="vehicle-type-new" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputClass} placeholder="مثال: شاحنة" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <PillButton
              disabled={create.isPending}
              onClick={() => {
                if (!newName.trim()) {
                  setError('اكتب اسم النوع.');
                  return focusField('vehicle-type-new');
                }
                create.mutate();
              }}
            >
              إضافة النوع
            </PillButton>
            <PillButton variant="secondary" onClick={() => setShowCreate(false)}>
              إلغاء
            </PillButton>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="أنواع المركبات"
          subtitle={data ? `${data.length} نوع` : undefined}
          action={
            !showCreate && (
              <PillButton size="sm" onClick={() => setShowCreate(true)}>
                نوع جديد +
              </PillButton>
            )
          }
        />
        {isLoading && <SkeletonRows rows={4} />}
        {isError && <p className="p-4 text-[15px] text-danger-dark lg:text-[13px]">تعذر تحميل أنواع المركبات. أعد تحميل الصفحة.</p>}
        {data && data.length === 0 && <p className="p-4 text-[15px] text-ink-soft lg:text-[13px]">لا توجد أنواع بعد. أضف أول نوع بزر «نوع جديد».</p>}
        {data && data.length > 0 && (
          <ul className="divide-y divide-line-soft">
            {typePage.pageItems.map((type) => (
              <li key={type.id} className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid={`vehicle-type-${type.id}`}>
                {editingId === type.id ? (
                  <div className="flex flex-1 flex-wrap items-end gap-2">
                    <div className="min-w-[12rem] flex-1">
                      <label htmlFor={`vehicle-type-edit-${type.id}`} className={labelClass}>
                        الاسم
                      </label>
                      <input id={`vehicle-type-edit-${type.id}`} data-testid={`vehicle-type-edit-${type.id}`} value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
                    </div>
                    <PillButton
                      size="sm"
                      disabled={update.isPending}
                      onClick={() => {
                        if (!editName.trim()) {
                          setError('الاسم مطلوب.');
                          return focusField(`vehicle-type-edit-${type.id}`);
                        }
                        update.mutate({ id: type.id, name: editName.trim() });
                      }}
                    >
                      حفظ
                    </PillButton>
                    <PillButton size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                      إلغاء
                    </PillButton>
                  </div>
                ) : (
                  <>
                    <p className="flex flex-wrap items-center gap-2 text-[16px] font-bold text-ink lg:text-[14px]">
                      {type.name}
                      <StatusPill variant={type.isActive ? 'ok' : 'neutral'}>{type.isActive ? 'فعّال' : 'مؤرشف'}</StatusPill>
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <PillButton
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSaved(null);
                          setEditingId(type.id);
                          setEditName(type.name);
                        }}
                      >
                        تعديل
                      </PillButton>
                      <PillButton size="sm" variant="ghost" disabled={update.isPending} onClick={() => update.mutate({ id: type.id, isActive: !type.isActive })}>
                        {type.isActive ? 'أرشفة' : 'استعادة'}
                      </PillButton>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pagination skip={typePage.skip} take={typePage.take} total={typePage.total} onSkipChange={typePage.setSkip} testId="vehicle-types-pager" />
      </Card>
    </div>
  );
}
