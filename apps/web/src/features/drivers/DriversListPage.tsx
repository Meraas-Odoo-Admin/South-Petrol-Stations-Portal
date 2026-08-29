import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';
import { PrevNext } from '../../components/PrevNext';
import { LtrText } from '../../components/LtrText';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { maskIdentityNumber } from '../../lib/masking';
import { identityTypeLabel } from '../../lib/labels';
import { useAuth } from '../auth/AuthProvider';
import type { DriverBasicInfo } from './types';

const TAKE = 20;

// Matches design 6a (desktop table). No mobile drivers-list artboard
// exists (documented gap) — the mobile card list below extends 5b's
// vehicle-card pattern (identity line + secondary meta line) rather than
// inventing an unrelated layout.
export function DriversListPage() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const [skip, setSkip] = useState(0);
  const [query, setQuery] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['drivers', 'list', skip],
    queryFn: async () =>
      (await apiClient.get<DriverBasicInfo[]>('/drivers', { params: { skip, take: TAKE } })).data,
  });

  const filtered = useMemo(() => {
    if (!data) return data;
    const needle = query.trim();
    if (!needle) return data;
    return data.filter((d) => d.fullName.includes(needle));
  }, [data, query]);

  return (
    <div>
      <PageHeader title="السائقون" subtitle={data ? `${data.length} سائق في هذه الصفحة` : undefined} />

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث باسم السائق"
        className="mb-4 h-9 w-full rounded-sm bg-surface px-3 text-[12.5px] text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-accent sm:w-72"
      />

      {isLoading && <p className="text-[13px] text-ink-soft">...جارٍ التحميل</p>}
      {isError && <p className="text-[13px] text-danger">تعذر تحميل قائمة السائقين.</p>}

      {filtered && (
        <>
          {/* Desktop table (6a) */}
          <Card className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[12.5px]">
                <thead>
                  <tr className="bg-surface-alt text-[11px] font-bold text-ink-soft">
                    <th className="px-[18px] py-2.5 text-start">الاسم</th>
                    <th className="px-[18px] py-2.5 text-start">نوع الهوية</th>
                    <th className="px-[18px] py-2.5 text-start">رقم الهوية</th>
                    <th className="px-[18px] py-2.5 text-start">الهاتف</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((driver) => (
                    <tr key={driver.id} className="border-b border-surface-alt last:border-0">
                      <td className="px-[18px] py-3">
                        <Link to={`/drivers/${driver.id}`} className="font-bold text-primary hover:underline">
                          {driver.fullName}
                        </Link>
                      </td>
                      <td className="px-[18px] py-3 text-ink-soft">{identityTypeLabel(driver.identityType)}</td>
                      <td className="px-[18px] py-3">
                        <LtrText>{maskIdentityNumber(driver.identityNumber, permissions)}</LtrText>
                      </td>
                      <td className="px-[18px] py-3 text-ink">
                        {driver.phone ? <LtrText>{driver.phone}</LtrText> : '—'}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-[13px] text-ink-soft">
                        لا يوجد سائقون مطابقون
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile card list — extends 5b's vehicle-card pattern (no drawn drivers-list mobile artboard) */}
          <div className="flex flex-col gap-2.5 sm:hidden">
            {filtered.map((driver) => (
              <Link key={driver.id} to={`/drivers/${driver.id}`}>
                <Card className="p-4">
                  <span className="text-[14px] font-extrabold text-ink">{driver.fullName}</span>
                  <div className="mt-1.5 text-[13px] font-bold text-ink-soft">
                    <LtrText>{maskIdentityNumber(driver.identityNumber, permissions)}</LtrText>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-faint">
                    <span>{identityTypeLabel(driver.identityType)}</span>
                    {driver.phone && (
                      <>
                        <span>·</span>
                        <LtrText>{driver.phone}</LtrText>
                      </>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
            {filtered.length === 0 && (
              <Card className="p-6 text-center text-[13px] text-ink-soft">لا يوجد سائقون مطابقون</Card>
            )}
          </div>

          <PrevNext skip={skip} take={TAKE} rowCount={data?.length ?? 0} onSkipChange={setSkip} />
        </>
      )}
    </div>
  );
}
