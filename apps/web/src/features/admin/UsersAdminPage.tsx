import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { roleLabel, permissionLabel } from '../../lib/labels';
import { LtrText } from '../../components/LtrText';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { useStations } from '../stations/useStations';
import type { AdminPermission, AdminRole, AdminUser } from './types';

// Item 7: no user-management UI existed anywhere before this — accounts
// could only be created via the seed script or direct API calls. Every
// mutation here (create, role assign/remove, station-scope add/remove)
// already writes an AuditLog row server-side (UsersService), so this is a
// thin client over endpoints that were already fully built and audited.
//
// Matches 2i's "الحسابات" card: table-in-a-card with اسم/الدور/نطاق
// المحطات/الحالة columns and a "+ حساب جديد" pill in the card header, not
// a bare bordered table on the page.
export function UsersAdminPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await apiClient.get<AdminUser[]>('/users')).data,
  });
  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => (await apiClient.get<AdminRole[]>('/roles')).data,
  });
  const permissionsQuery = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: async () => (await apiClient.get<AdminPermission[]>('/permissions')).data,
  });
  const { data: stations } = useStations();

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  const createMutation = useMutation({
    mutationFn: () => apiClient.post('/users', { username, password, fullName, phone: phone || undefined }),
    onSuccess: () => {
      setError(null);
      setShowCreate(false);
      setUsername('');
      setPassword('');
      setFullName('');
      setPhone('');
      invalidateUsers();
    },
    // The backend's own message body is English technical text — never
    // shown verbatim in this Arabic UI (code-leak audit finding).
    onError: () => setError('تعذر إضافة المستخدم — تحقّق من عدم تكرار اسم المستخدم وأن كلمة المرور 8 أحرف على الأقل.'),
  });

  const assignRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      apiClient.post(`/users/${userId}/roles`, { roleId }),
    onSuccess: invalidateUsers,
    onError: () => setError('تعذر إسناد الدور.'),
  });
  const removeRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      apiClient.delete(`/users/${userId}/roles/${roleId}`),
    onSuccess: invalidateUsers,
    onError: () => setError('تعذر إزالة الدور.'),
  });
  const addScope = useMutation({
    mutationFn: ({ userId, stationId }: { userId: string; stationId: string }) =>
      apiClient.post(`/users/${userId}/station-scope`, { stationId }),
    onSuccess: invalidateUsers,
    onError: () => setError('تعذر إضافة نطاق المحطة.'),
  });
  const removeScope = useMutation({
    mutationFn: ({ userId, stationId }: { userId: string; stationId: string }) =>
      apiClient.delete(`/users/${userId}/station-scope/${stationId}`),
    onSuccess: invalidateUsers,
    onError: () => setError('تعذر إزالة نطاق المحطة.'),
  });
  // Round 12: grant/revoke ONE permission directly to this user, independent
  // of their roles — "given to certain users they pick, it could be given
  // to certain employees and not for other employees" (the client's own
  // framing, originally about fillups:record_exception specifically, but
  // this covers any permission since the mechanism is generic — see
  // UserPermission's schema comment).
  const grantPermission = useMutation({
    mutationFn: ({ userId, permissionId }: { userId: string; permissionId: string }) =>
      apiClient.post(`/users/${userId}/permissions`, { permissionId }),
    onSuccess: invalidateUsers,
    onError: () => setError('تعذر منح الصلاحية.'),
  });
  const revokePermission = useMutation({
    mutationFn: ({ userId, permissionId }: { userId: string; permissionId: string }) =>
      apiClient.delete(`/users/${userId}/permissions/${permissionId}`),
    onSuccess: invalidateUsers,
    onError: () => setError('تعذر سحب الصلاحية.'),
  });

  return (
    <div className="space-y-4">
      {showCreate && (
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">اسم المستخدم</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                dir="ltr"
                className="h-9 w-44 rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">كلمة المرور المبدئية</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="text"
                dir="ltr"
                className="h-9 w-44 rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">الاسم الكامل</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-9 w-52 rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">الهاتف (اختياري)</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                className="h-9 w-36 rounded-sm bg-surface-alt px-3 text-end text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <PillButton
              disabled={!username || password.length < 8 || !fullName || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              حفظ
            </PillButton>
          </div>
          <p className="mt-3 text-[11px] text-ink-faint">
            سيُطلب من المستخدم تغيير كلمة المرور عند أول تسجيل دخول. كلمة المرور 8 أحرف على الأقل.
          </p>
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <CardHeader
          title="الحسابات"
          subtitle={usersQuery.data ? `${usersQuery.data.length} حساب` : undefined}
          action={
            <PillButton size="sm" onClick={() => setShowCreate((s) => !s)}>
              {showCreate ? 'إلغاء' : 'حساب جديد +'}
            </PillButton>
          }
        />

        {usersQuery.isLoading && <p className="p-4 text-sm text-ink-soft">...جارٍ التحميل</p>}
        {usersQuery.isError && <p className="p-4 text-sm text-danger">تعذر تحميل قائمة المستخدمين.</p>}

        {usersQuery.data && (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="bg-surface-alt text-[11px] font-bold text-ink-soft">
                <th className="px-[18px] py-2.5 text-start">الاسم</th>
                <th className="px-[18px] py-2.5 text-start">الدور</th>
                <th className="px-[18px] py-2.5 text-start">نطاق المحطات</th>
                <th className="px-[18px] py-2.5 text-start">الحالة</th>
                <th className="px-[18px] py-2.5 text-start"></th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.data.map((u) => (
                <Fragment key={u.id}>
                  <tr className="border-b border-surface-alt align-top last:border-0">
                    <td className="px-[18px] py-3">
                      <div className="font-medium text-ink">{u.fullName}</div>
                      <CodeText>{u.username}</CodeText>
                    </td>
                    <td className="px-[18px] py-3 text-ink">{u.roles.map((r) => roleLabel(r.role.name)).join('، ') || '—'}</td>
                    <td className="px-[18px] py-3">
                      <CodeText>
                        {u.roles.some((r) => r.role.unrestrictedStationAccess)
                          ? 'كل المحطات'
                          : u.stationScope.map((s) => s.station.internalCode).join('، ') || '—'}
                      </CodeText>
                    </td>
                    <td className="px-[18px] py-3">
                      <StatusPill variant={u.isActive ? 'ok' : 'danger'}>
                        {u.isActive ? 'نشط' : 'موقوف'}
                      </StatusPill>
                    </td>
                    <td className="px-[18px] py-3">
                      <PillButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedUserId((cur) => (cur === u.id ? null : u.id))}
                      >
                        {expandedUserId === u.id ? 'إغلاق' : 'إدارة'}
                      </PillButton>
                    </td>
                  </tr>
                  {expandedUserId === u.id && (
                    <tr className="border-b border-surface-alt bg-paper last:border-0">
                      <td colSpan={5} className="px-[18px] py-4">
                        <div className="grid grid-cols-3 gap-6">
                          <div>
                            <p className="mb-2 text-[12px] font-bold text-ink">الأدوار</p>
                            <div className="space-y-1.5">
                              {rolesQuery.data?.map((role) => {
                                const held = u.roles.some((r) => r.roleId === role.id);
                                return (
                                  <label key={role.id} className="flex items-center gap-2 text-[12px] text-ink">
                                    <input
                                      type="checkbox"
                                      checked={held}
                                      onChange={(e) =>
                                        e.target.checked
                                          ? assignRole.mutate({ userId: u.id, roleId: role.id })
                                          : removeRole.mutate({ userId: u.id, roleId: role.id })
                                      }
                                    />
                                    {roleLabel(role.name)}
                                    {role.unrestrictedStationAccess && (
                                      <span className="text-[11px] text-ink-faint">(كل المحطات)</span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <p className="mb-2 text-[12px] font-bold text-ink">نطاق المحطات</p>
                            <div className="space-y-1.5">
                              {stations?.map((station) => {
                                const held = u.stationScope.some((s) => s.stationId === station.id);
                                return (
                                  <label key={station.id} className="flex items-center gap-2 text-[12px] text-ink">
                                    <input
                                      type="checkbox"
                                      checked={held}
                                      onChange={(e) =>
                                        e.target.checked
                                          ? addScope.mutate({ userId: u.id, stationId: station.id })
                                          : removeScope.mutate({ userId: u.id, stationId: station.id })
                                      }
                                    />
                                    <LtrText>{station.internalCode}</LtrText> — {station.name}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <p className="mb-2 text-[12px] font-bold text-ink">صلاحيات إضافية (فردية)</p>
                            <p className="mb-2 text-[10.5px] text-ink-faint">
                              تُضاف فوق صلاحيات الأدوار أعلاه، ولا تُلغيها — منح فردي لهذا المستخدم تحديدًا.
                            </p>
                            <div className="max-h-64 space-y-1.5 overflow-y-auto">
                              {permissionsQuery.data?.map((permission) => {
                                const held = u.directPermissions.some((p) => p.permissionId === permission.id);
                                return (
                                  <label key={permission.id} className="flex items-center gap-2 text-[12px] text-ink">
                                    <input
                                      type="checkbox"
                                      checked={held}
                                      onChange={(e) =>
                                        e.target.checked
                                          ? grantPermission.mutate({ userId: u.id, permissionId: permission.id })
                                          : revokePermission.mutate({ userId: u.id, permissionId: permission.id })
                                      }
                                    />
                                    {permissionLabel(permission.key)}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}
