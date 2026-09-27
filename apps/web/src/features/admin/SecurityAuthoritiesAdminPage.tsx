import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import type { MunicipalityRef } from '../stations/types';
import { adminErrorMessage } from './adminErrors';

interface AuthorityRow {
  id: string;
  name: string;
  municipalityId: string | null;
  municipality: { id: string; name: string; status: 'PREPARING' | 'LIVE' } | null;
}

const inputClass =
  'h-9 rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent';

// Registration pivot, phase 2 — the admin screen Phase 1 left API-only.
// Exactly one security authority per municipality (OPEN_ITEMS.md #4): every
// petrol station and registration station in the municipality falls under
// it. The municipality pickers only offer municipalities that don't have
// an authority yet (the API enforces the same, and also refuses moving an
// authority off a LIVE municipality).
export function SecurityAuthoritiesAdminPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMunicipalityId, setNewMunicipalityId] = useState('');

  const authoritiesQuery = useQuery({
    queryKey: ['admin', 'security-authorities'],
    queryFn: async () => (await apiClient.get<AuthorityRow[]>('/security-authorities')).data,
  });
  const municipalitiesQuery = useQuery({
    queryKey: ['admin', 'municipalities'],
    queryFn: async () => (await apiClient.get<MunicipalityRef[]>('/municipalities')).data,
  });
  const freeMunicipalities = (municipalitiesQuery.data ?? []).filter((m) => !m.securityAuthority);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'security-authorities'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'municipalities'] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/security-authorities', { name: newName.trim(), municipalityId: newMunicipalityId }),
    onSuccess: () => {
      setError(null);
      setShowCreate(false);
      setNewName('');
      setNewMunicipalityId('');
      invalidate();
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذر إضافة الجهة الأمنية.')),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; name?: string; municipalityId?: string }) =>
      apiClient.patch(`/security-authorities/${payload.id}`, {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.municipalityId !== undefined ? { municipalityId: payload.municipalityId } : {}),
      }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setError(adminErrorMessage(err, 'تعذر تحديث الجهة الأمنية.'));
      invalidate();
    },
  });

  return (
    <div className="space-y-4">
      {showCreate && (
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">اسم الجهة الأمنية</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: مديرية أمن سبها"
                className={`${inputClass} w-64`}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">البلدية التي تشرف عليها</label>
              <select
                value={newMunicipalityId}
                onChange={(e) => setNewMunicipalityId(e.target.value)}
                className={`${inputClass} w-56`}
              >
                <option value="">اختر البلدية</option>
                {freeMunicipalities.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <PillButton
              disabled={!newName.trim() || !newMunicipalityId || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              إضافة
            </PillButton>
          </div>
          {freeMunicipalities.length === 0 && municipalitiesQuery.data && (
            <p className="mt-2 text-[11px] text-ink-faint">لكل البلديات جهة أمنية مسبقًا.</p>
          )}
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <CardHeader
          title="الجهات الأمنية"
          subtitle="جهة أمنية واحدة لكل بلدية — تشرف على كل محطاتها ومكاتب التسجيل فيها"
          action={
            <PillButton size="sm" onClick={() => setShowCreate((s) => !s)}>
              {showCreate ? 'إلغاء' : 'جهة أمنية جديدة +'}
            </PillButton>
          }
        />
        {authoritiesQuery.isLoading && <p className="p-4 text-sm text-ink-soft">...جارٍ التحميل</p>}
        {authoritiesQuery.isError && <p className="p-4 text-sm text-danger">تعذر تحميل الجهات الأمنية.</p>}
        {authoritiesQuery.data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12.5px]">
              <thead>
                <tr className="bg-surface-alt text-[11px] font-bold text-ink-soft">
                  <th className="px-[18px] py-2.5 text-start">الجهة الأمنية</th>
                  <th className="px-[18px] py-2.5 text-start">البلدية</th>
                </tr>
              </thead>
              <tbody>
                {authoritiesQuery.data.map((a) => (
                  <tr key={a.id} className="border-b border-surface-alt last:border-0">
                    <td className="px-[18px] py-3">
                      <input
                        defaultValue={a.name}
                        onBlur={(e) => {
                          const name = e.target.value.trim();
                          if (name && name !== a.name) updateMutation.mutate({ id: a.id, name });
                        }}
                        className={`${inputClass} w-full max-w-xs`}
                      />
                    </td>
                    <td className="px-[18px] py-3">
                      {a.municipality?.status === 'LIVE' ? (
                        // Can't be moved off a live municipality — shown, not editable.
                        <span className="font-bold text-ink">{a.municipality.name}</span>
                      ) : (
                        <select
                          value={a.municipalityId ?? ''}
                          onChange={(e) => e.target.value && updateMutation.mutate({ id: a.id, municipalityId: e.target.value })}
                          className={`${inputClass} w-56`}
                        >
                          {!a.municipality && <option value="">— غير مرتبطة —</option>}
                          {a.municipality && <option value={a.municipality.id}>{a.municipality.name}</option>}
                          {freeMunicipalities.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      )}
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
