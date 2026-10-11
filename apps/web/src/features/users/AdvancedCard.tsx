import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { permissionLabel } from '../../lib/labels';
import { Card } from '../../components/design/Card';
import { Icon, ICONS } from '../../components/icons';
import { adminErrorMessage } from '../admin/adminErrors';
import type { AdminPermission } from '../admin/types';
import { Notice } from './parts';
import { useAccountMutation } from './useUsers';
import type { UserDetail } from './types';

// Extra individual permissions, on top of what the job gives. Rarely needed
// and easy to misuse, so it is closed by default, says what it is for, and is
// only drawn for someone who may grant permissions at all.
export function AdvancedCard({ user }: { user: UserDetail }) {
  const [open, setOpen] = useState(false);
  const held = new Set(user.directPermissions.map((p) => p.permissionId));

  const permissions = useQuery({
    queryKey: ['admin', 'permissions'],
    enabled: open,
    queryFn: async () => (await apiClient.get<AdminPermission[]>('/permissions')).data,
  });

  const grant = useAccountMutation(user.id, async (permissionId: string) => {
    await apiClient.post(`/users/${user.id}/permissions`, { permissionId });
    return (await apiClient.get<UserDetail>(`/users/${user.id}`)).data;
  });
  const revoke = useAccountMutation(user.id, async (permissionId: string) => {
    await apiClient.delete(`/users/${user.id}/permissions/${permissionId}`);
    return (await apiClient.get<UserDetail>(`/users/${user.id}`)).data;
  });
  const error = grant.error ?? revoke.error;
  const count = user.directPermissions.length;

  return (
    <Card>
      <section aria-label="خيارات متقدمة" className="p-4 lg:p-5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="advanced-body"
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[48px] w-full items-center justify-between gap-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <span>
            <span className="block text-[18px] font-extrabold text-ink lg:text-[15px]">خيارات متقدمة</span>
            <span className="block text-[15px] text-ink-soft lg:text-[13px]">
              {count === 0 ? 'لا توجد صلاحيات إضافية' : count === 1 ? 'صلاحية إضافية واحدة' : `${count} صلاحيات إضافية`}
            </span>
          </span>
          <span className={`text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`}>
            <Icon d={ICONS.chevronDown} size={22} />
          </span>
        </button>

        {open && (
          <div id="advanced-body" className="mt-4 space-y-4">
            <Notice kind="pending">
              للحالات الاستثنائية فقط. تُضاف هذه الصلاحيات فوق صلاحيات الوظيفة ولا تُلغيها، وكل منح أو سحب يُسجَّل
              باسمك. إن كان الشخص يحتاجها دائمًا فالأصح تغيير وظيفته.
            </Notice>
            {error && <Notice kind="error">{adminErrorMessage(error, 'تعذّر تغيير الصلاحية.')}</Notice>}
            {permissions.isLoading && <p className="text-[15px] text-ink-soft lg:text-[13px]">جارٍ تحميل القائمة…</p>}
            {permissions.isError && <Notice kind="error">تعذّر تحميل قائمة الصلاحيات.</Notice>}
            <ul className="max-h-96 overflow-y-auto rounded-md bg-surface shadow-sm">
              {permissions.data?.map((permission) => {
                const on = held.has(permission.id);
                return (
                  <li key={permission.id} className="border-b border-surface-alt last:border-0">
                    <label className="flex min-h-[52px] cursor-pointer items-center gap-3 px-4 py-2 hover:bg-surface-alt lg:min-h-[44px]">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={grant.isPending || revoke.isPending}
                        onChange={(e) => (e.target.checked ? grant.mutate(permission.id) : revoke.mutate(permission.id))}
                        className="h-5 w-5 shrink-0 accent-primary"
                      />
                      <span className="text-[16px] text-ink lg:text-[14px]">{permissionLabel(permission.key)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </Card>
  );
}
