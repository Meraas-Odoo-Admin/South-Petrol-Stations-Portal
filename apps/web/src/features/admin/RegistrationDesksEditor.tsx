import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import type { RegistrationDeskRow } from '../cards/cardApi';
import { adminErrorMessage } from './adminErrors';

const inputClass =
  'h-8 w-full rounded-sm bg-surface-alt px-2.5 text-[12px] text-ink focus:outline-none focus:ring-2 focus:ring-accent';

// Registration pivot, phase 3: the desks (and their card printers) at one
// registration station. Staff pick their desk once per device; every card
// records which desk printed it.
export function RegistrationDesksEditor({ registrationStationId }: { registrationStationId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', printerModel: '', printerSerial: '' });
  const queryKey = ['registration-desks', registrationStationId];

  const desksQuery = useQuery({
    queryKey,
    queryFn: async () =>
      (await apiClient.get<RegistrationDeskRow[]>(`/registration-stations/${registrationStationId}/desks`)).data,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const create = useMutation({
    mutationFn: () =>
      apiClient.post(`/registration-stations/${registrationStationId}/desks`, {
        name: draft.name.trim(),
        printerModel: draft.printerModel.trim() || undefined,
        printerSerial: draft.printerSerial.trim() || undefined,
      }),
    onSuccess: () => {
      setError(null);
      setDraft({ name: '', printerModel: '', printerSerial: '' });
      invalidate();
    },
    onError: (err) => setError(adminErrorMessage(err, 'تعذرت إضافة المكتب.')),
  });

  const update = useMutation({
    mutationFn: (payload: { id: string } & Partial<Pick<RegistrationDeskRow, 'name' | 'printerModel' | 'printerSerial' | 'isActive'>>) => {
      const { id, ...body } = payload;
      return apiClient.patch(`/registration-desks/${id}`, body);
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setError(adminErrorMessage(err, 'تعذر تحديث المكتب.'));
      invalidate();
    },
  });

  const saveOnBlur =
    (desk: RegistrationDeskRow, field: 'name' | 'printerModel' | 'printerSerial') =>
    (e: React.FocusEvent<HTMLInputElement>) => {
      const value = e.target.value.trim();
      if (value === (desk[field] ?? '')) return;
      if (field === 'name' && !value) return;
      update.mutate({ id: desk.id, [field]: value });
    };

  return (
    <div className="mt-3 rounded-sm bg-paper p-3" data-testid="registration-desks-editor">
      <p className="mb-2 text-[12px] font-bold text-ink">مكاتب الطباعة</p>
      {desksQuery.data?.length === 0 && <p className="mb-2 text-[11.5px] text-ink-faint">لا توجد مكاتب بعد — أضف مكتبًا لتتمكن من طباعة البطاقات.</p>}
      <div className="space-y-2">
        {desksQuery.data?.map((desk) => (
          <div key={desk.id} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input defaultValue={desk.name} onBlur={saveOnBlur(desk, 'name')} className={inputClass} aria-label="اسم المكتب" />
            <input
              defaultValue={desk.printerModel ?? ''}
              onBlur={saveOnBlur(desk, 'printerModel')}
              placeholder="طراز الطابعة"
              className={inputClass}
            />
            <input
              defaultValue={desk.printerSerial ?? ''}
              onBlur={saveOnBlur(desk, 'printerSerial')}
              placeholder="الرقم التسلسلي للطابعة"
              dir="ltr"
              className={inputClass}
            />
            <span className="flex items-center gap-2">
              <StatusPill variant={desk.isActive ? 'ok' : 'neutral'}>{desk.isActive ? 'مفعّل' : 'موقوف'}</StatusPill>
              <PillButton size="sm" variant="ghost" onClick={() => update.mutate({ id: desk.id, isActive: !desk.isActive })}>
                {desk.isActive ? 'إيقاف' : 'تفعيل'}
              </PillButton>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 items-center gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="اسم المكتب الجديد"
          className={inputClass}
          data-testid="registration-desk-new-name"
        />
        <input
          value={draft.printerModel}
          onChange={(e) => setDraft({ ...draft, printerModel: e.target.value })}
          placeholder="طراز الطابعة"
          className={inputClass}
        />
        <input
          value={draft.printerSerial}
          onChange={(e) => setDraft({ ...draft, printerSerial: e.target.value })}
          placeholder="الرقم التسلسلي"
          dir="ltr"
          className={inputClass}
        />
        <PillButton size="sm" disabled={!draft.name.trim() || create.isPending} onClick={() => create.mutate()} data-testid="registration-desk-add">
          إضافة مكتب
        </PillButton>
      </div>
      {error && <p className="mt-2 text-[11.5px] text-danger">{error}</p>}
    </div>
  );
}
