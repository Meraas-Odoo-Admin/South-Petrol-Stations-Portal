import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import type { ExceptionTypeRow } from './types';

// Item 7's expansion request: ExceptionType was already a DB-driven lookup
// table (not a hardcoded enum) before this phase — what was missing was
// this admin CRUD screen. "Delete" is deliberately absent: the backend has
// no DELETE endpoint anywhere in this system (see UpdateExceptionTypeDto's
// comment) — isActive is the only way to retire one, which correctly
// leaves every historical Exception row's reference intact.
//
// Not mocked in 2i (only Accounts/Settings/Audit log are) — extends the
// same card/table/pill vocabulary per design-system-notes.md's instruction
// to apply the system to unmocked screens too.
export function ExceptionTypesAdminPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [newRequiresProof, setNewRequiresProof] = useState(true);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'exception-types'],
    queryFn: async () => (await apiClient.get<ExceptionTypeRow[]>('/fillups/exception-types/all')).data,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'exception-types'] });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/fillups/exception-types', {
        key: newKey,
        name: newName,
        requiresProof: newRequiresProof,
      }),
    onSuccess: () => {
      setError(null);
      setShowCreate(false);
      setNewKey('');
      setNewName('');
      setNewRequiresProof(true);
      invalidate();
    },
    // The backend's own message body is English technical text — never
    // shown verbatim in this Arabic UI (code-leak audit finding).
    onError: () => setError('تعذر إضافة نوع الاستثناء — تحقّق من عدم تكرار المفتاح.'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; name?: string; requiresProof?: boolean; isActive?: boolean }) =>
      apiClient.patch(`/fillups/exception-types/${payload.id}`, {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.requiresProof !== undefined ? { requiresProof: payload.requiresProof } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      }),
    onSuccess: invalidate,
    onError: () => setError('تعذر تحديث نوع الاستثناء.'),
  });

  return (
    <div className="space-y-4">
      {showCreate && (
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[13px] lg:text-[12px] text-ink-soft">المفتاح (غير قابل للتغيير لاحقًا)</label>
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                dir="ltr"
                className="h-9 w-48 rounded-sm bg-surface-alt px-3 text-[13px] lg:text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] lg:text-[12px] text-ink-soft">الاسم المعروض بالعربية</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9 w-56 rounded-sm bg-surface-alt px-3 text-[13px] lg:text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <label className="flex items-center gap-2 text-[13px] lg:text-[12.5px] text-ink-soft">
              <input
                type="checkbox"
                checked={newRequiresProof}
                onChange={(e) => setNewRequiresProof(e.target.checked)}
              />
              يتطلب إثباتًا
            </label>
            <PillButton disabled={!newKey || !newName || createMutation.isPending} onClick={() => createMutation.mutate()}>
              إضافة
            </PillButton>
          </div>
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <CardHeader
          title="أنواع الاستثناءات"
          subtitle={data ? `${data.length} نوع` : undefined}
          action={
            <PillButton size="sm" onClick={() => setShowCreate((s) => !s)}>
              {showCreate ? 'إلغاء' : 'نوع جديد +'}
            </PillButton>
          }
        />

        {isLoading && <p className="p-4 text-sm text-ink-soft">...جارٍ التحميل</p>}
        {isError && <p className="p-4 text-sm text-danger">تعذر تحميل أنواع الاستثناءات.</p>}

        {data && (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px] lg:text-[12.5px]">
            <thead>
              <tr className="bg-surface-alt text-[13px] lg:text-[12px] font-bold text-ink-soft">
                <th className="px-[18px] py-2.5 text-start">المفتاح</th>
                <th className="px-[18px] py-2.5 text-start">الاسم</th>
                <th className="px-[18px] py-2.5 text-start">يتطلب إثباتًا</th>
                <th className="px-[18px] py-2.5 text-start">الحالة</th>
                <th className="px-[18px] py-2.5 text-start"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((type) => (
                <tr key={type.id} className="border-b border-surface-alt last:border-0">
                  <td className="px-[18px] py-3">
                    <CodeText>{type.key}</CodeText>
                  </td>
                  <td className="px-[18px] py-3">
                    <input
                      defaultValue={type.name}
                      onBlur={(e) => {
                        if (e.target.value !== type.name && e.target.value.trim()) {
                          updateMutation.mutate({ id: type.id, name: e.target.value });
                        }
                      }}
                      className="h-8 w-full max-w-xs rounded-sm bg-surface-alt px-2.5 text-[13px] lg:text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </td>
                  <td className="px-[18px] py-3">
                    <input
                      type="checkbox"
                      checked={type.requiresProof}
                      onChange={(e) => updateMutation.mutate({ id: type.id, requiresProof: e.target.checked })}
                    />
                  </td>
                  <td className="px-[18px] py-3">
                    <StatusPill variant={type.isActive ? 'ok' : 'neutral'}>
                      {type.isActive ? 'فعّال' : 'موقوف'}
                    </StatusPill>
                  </td>
                  <td className="px-[18px] py-3">
                    <PillButton
                      variant="ghost"
                      size="sm"
                      onClick={() => updateMutation.mutate({ id: type.id, isActive: !type.isActive })}
                    >
                      {type.isActive ? 'إيقاف' : 'تفعيل'}
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
