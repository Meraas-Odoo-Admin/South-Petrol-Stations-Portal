import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';

interface VehicleTypeRow {
  id: string;
  name: string;
  isActive: boolean;
}

// Round 12: the client wants "نوع المركبة" configured by admin/system_admin
// in Settings, same pattern as ExceptionTypesAdminPage (list + create +
// isActive toggle, no delete — see VehicleType's schema comment for why
// this is a lookup table now instead of the old free-text field).
export function VehicleTypesAdminPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'vehicle-types'],
    queryFn: async () => (await apiClient.get<VehicleTypeRow[]>('/vehicle-types')).data,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'vehicle-types'] });

  const createMutation = useMutation({
    mutationFn: () => apiClient.post('/vehicle-types', { name: newName }),
    onSuccess: () => {
      setError(null);
      setShowCreate(false);
      setNewName('');
      invalidate();
    },
    onError: () => setError('تعذر إضافة نوع المركبة — تحقّق من عدم تكرار الاسم.'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; name?: string; isActive?: boolean }) =>
      apiClient.patch(`/vehicle-types/${payload.id}`, {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      }),
    onSuccess: invalidate,
    onError: () => setError('تعذر تحديث نوع المركبة.'),
  });

  return (
    <div className="space-y-4">
      {showCreate && (
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[13px] lg:text-[12px] text-ink-soft">اسم النوع</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9 w-56 rounded-sm bg-surface-alt px-3 text-[13px] lg:text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <PillButton disabled={!newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
              إضافة
            </PillButton>
          </div>
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <CardHeader
          title="أنواع المركبات"
          subtitle={data ? `${data.length} نوع` : undefined}
          action={
            <PillButton size="sm" onClick={() => setShowCreate((s) => !s)}>
              {showCreate ? 'إلغاء' : 'نوع جديد +'}
            </PillButton>
          }
        />

        {isLoading && <p className="p-4 text-sm text-ink-soft">...جارٍ التحميل</p>}
        {isError && <p className="p-4 text-sm text-danger">تعذر تحميل أنواع المركبات.</p>}

        {data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[13px] lg:text-[12.5px]">
              <thead>
                <tr className="bg-surface-alt text-[13px] lg:text-[12px] font-bold text-ink-soft">
                  <th className="px-[18px] py-2.5 text-start">الاسم</th>
                  <th className="px-[18px] py-2.5 text-start">الحالة</th>
                  <th className="px-[18px] py-2.5 text-start"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((type) => (
                  <tr key={type.id} className="border-b border-surface-alt last:border-0">
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
