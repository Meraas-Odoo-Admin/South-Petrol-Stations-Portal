import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { TextField } from '../../components/design/TextField';
import { adminErrorMessage } from '../admin/adminErrors';
import { Notice, SectionCard } from './parts';
import { useAccountMutation } from './useUsers';
import type { UserDetail } from './types';

// Who this is: name, username, phone. The username is the login and the key
// to the audit trail, so it never changes after creation.
export function IdentityCard({ user, readOnlyNote }: { user: UserDetail; readOnlyNote: string | null }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [saved, setSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(user.fullName);
    setPhone(user.phone ?? '');
  }, [user.id, user.fullName, user.phone]);

  const editable = user.capabilities.canEditIdentity;
  const dirty = fullName.trim() !== user.fullName || phone.trim() !== (user.phone ?? '');

  const save = useAccountMutation(user.id, async () =>
    (await apiClient.patch<UserDetail>(`/users/${user.id}`, { fullName: fullName.trim(), phone: phone.trim() })).data,
  );

  function submit() {
    setSaved(false);
    if (fullName.trim().length < 2) {
      setNameError('اكتب الاسم الكامل (حرفان على الأقل).');
      return;
    }
    setNameError(null);
    save.mutate(undefined as never, { onSuccess: () => setSaved(true) });
  }

  return (
    <SectionCard title="الهوية">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
        noValidate
      >
        <TextField
          label="الاسم الكامل"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            setSaved(false);
          }}
          disabled={!editable}
          disabledReason={readOnlyNote ?? undefined}
          error={nameError}
          autoComplete="off"
        />
        <TextField
          label="اسم المستخدم"
          value={user.username}
          ltr
          disabled
          readOnly
          disabledReason="اسم المستخدم لا يتغيّر بعد إنشاء الحساب لأنه أساس سجل التغييرات."
        />
        <TextField
          label="الهاتف (اختياري)"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setSaved(false);
          }}
          ltr
          inputMode="tel"
          disabled={!editable}
          disabledReason={readOnlyNote ?? undefined}
          autoComplete="off"
        />
        {save.isError && <Notice kind="error">{adminErrorMessage(save.error, 'تعذّر حفظ البيانات. حاول مجددًا.')}</Notice>}
        {saved && !dirty && <Notice kind="success">تم حفظ البيانات.</Notice>}
        {editable && (
          <PillButton type="submit" size="field" disabled={!dirty || save.isPending}>
            {save.isPending ? 'جارٍ الحفظ…' : 'حفظ البيانات'}
          </PillButton>
        )}
      </form>
    </SectionCard>
  );
}
