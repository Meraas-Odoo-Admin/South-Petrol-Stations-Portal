import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Card } from '../../components/design/Card';
import { Switch } from '../../components/design/Switch';
import { Icon, ICONS } from '../../components/icons';
import { adminErrorMessage } from '../admin/adminErrors';
import { Notice } from './parts';
import { useAccountMutation } from './useUsers';
import type { UserDetail } from './types';

// A person's permissions, grouped by area, in plain Arabic (phase 5B).
//
//  - Those the JOB gives are ticked and locked, labelled «من الوظيفة». They
//    cannot be taken away one by one: change the job instead, and the locked
//    ticks follow it at once (the list reloads when the job changes).
//  - Extra permissions are switches, shown only where this caller may switch
//    them (the API lists only those; a municipality manager gets the set
//    supervisors may hold, the super admin anything).

interface PermissionRow {
  id: string;
  key: string;
  label: string;
  fromJob: boolean;
  granted: boolean;
  canSwitch: boolean;
}
interface PermissionGroup {
  area: string;
  label: string;
  permissions: PermissionRow[];
}
interface PermissionsResponse {
  userId: string;
  canManageAdvanced: boolean;
  groups: PermissionGroup[];
}

export function AdvancedCard({ user }: { user: UserDetail }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const jobKey = user.roles.map((r) => r.roleId).join(',');
  const queryKey = ['users', user.id, 'permissions', jobKey];

  const permissions = useQuery({
    queryKey,
    enabled: open,
    queryFn: async () => (await apiClient.get<PermissionsResponse>(`/users/${user.id}/permissions`)).data,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users', user.id, 'permissions'] });
  const grant = useAccountMutation(user.id, async (permissionId: string) => {
    await apiClient.post(`/users/${user.id}/permissions`, { permissionId });
    return (await apiClient.get<UserDetail>(`/users/${user.id}`)).data;
  });
  const revoke = useAccountMutation(user.id, async (permissionId: string) => {
    await apiClient.delete(`/users/${user.id}/permissions/${permissionId}`);
    return (await apiClient.get<UserDetail>(`/users/${user.id}`)).data;
  });
  const error = grant.error ?? revoke.error;
  const busy = grant.isPending || revoke.isPending;

  const all = permissions.data?.groups.flatMap((g) => g.permissions) ?? [];
  const fromJobCount = all.filter((p) => p.fromJob).length;
  const extraCount = user.directPermissions.length;

  return (
    <Card>
      <section aria-label="الصلاحيات" className="p-4 lg:p-5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="advanced-body"
          data-testid="permissions-toggle"
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[48px] w-full items-center justify-between gap-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <span>
            <span className="block text-[18px] font-extrabold text-ink lg:text-[15px]">الصلاحيات</span>
            <span className="block text-[15px] text-ink-soft lg:text-[13px]">
              {extraCount === 0 ? 'صلاحيات الوظيفة فقط، بلا إضافات' : extraCount === 1 ? 'صلاحية إضافية واحدة' : `${extraCount} صلاحيات إضافية`}
            </span>
          </span>
          <span className={`text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`}>
            <Icon d={ICONS.chevronDown} size={22} />
          </span>
        </button>

        {open && (
          <div id="advanced-body" className="mt-4 space-y-5" data-testid="permissions-body">
            <Notice kind="pending">
              صلاحيات الوظيفة ثابتة ولا تُسحب وحدها: لتغييرها غيّر الوظيفة. الصلاحيات الإضافية للحالات الاستثنائية فقط، وكل منح أو سحب يُسجَّل باسمك.
            </Notice>
            {error && <Notice kind="error">{adminErrorMessage(error, 'تعذّر تغيير الصلاحية.')}</Notice>}
            {permissions.isLoading && <p className="text-[15px] text-ink-soft lg:text-[13px]">جارٍ تحميل القائمة…</p>}
            {permissions.isError && <Notice kind="error">تعذّر تحميل قائمة الصلاحيات.</Notice>}
            {permissions.data && fromJobCount === 0 && (
              <p className="text-[15px] text-ink-soft lg:text-[13px]">لا وظيفة محدّدة لهذا الحساب بعد.</p>
            )}

            {permissions.data?.groups.map((group) => (
              <div key={group.area} data-testid={`permission-group-${group.area}`}>
                <h3 className="mb-1.5 text-[16px] font-extrabold text-primary-dark lg:text-[14px]">{group.label}</h3>
                <ul className="rounded-md bg-surface shadow-sm">
                  {group.permissions.map((p) => (
                    <li
                      key={p.id}
                      data-testid={`permission-${p.key}`}
                      className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line px-4 py-2 last:border-0 lg:min-h-[44px]"
                    >
                      <span className="text-[16px] text-ink lg:text-[14px]">{p.label}</span>
                      {p.fromJob ? (
                        <span
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-100 px-3 py-1 text-[14px] font-bold text-primary-dark lg:text-[12px]"
                          data-testid={`permission-locked-${p.key}`}
                        >
                          <Icon d={ICONS.lock} size={14} />
                          من الوظيفة
                        </span>
                      ) : (
                        <Switch
                          checked={p.granted}
                          label={p.label}
                          onLabel="مضافة"
                          offLabel="غير مضافة"
                          busy={busy}
                          disabled={!p.canSwitch}
                          testId={`permission-switch-${p.key}`}
                          onChange={(next) =>
                            (next ? grant : revoke).mutate(p.id, { onSuccess: () => void refresh() })
                          }
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </Card>
  );
}
