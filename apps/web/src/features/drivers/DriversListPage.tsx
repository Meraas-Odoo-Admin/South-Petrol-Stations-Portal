import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';
import { PrevNext } from '../../components/PrevNext';
import { LtrText } from '../../components/LtrText';
import { maskIdentityNumber } from '../../lib/masking';
import { useAuth } from '../auth/AuthProvider';
import type { DriverBasicInfo } from './types';

const TAKE = 20;

// Minimal browse screen (item 3) — GET /drivers isn't station-scoped
// (drivers are a directorate-wide registry; only fill-ups carry a
// stationId), same as VehiclesListPage. Read-only: no create/edit/delete
// here. Identity number is masked client-side the same way it is
// everywhere else it's shown (see lib/masking.ts).
//
// Search box added per item 11, same reasoning as VehiclesListPage. GET
// /drivers has no server-side name filter (unlike vehicles' search= param
// — see DriverSearchSelect's own comment on this same limitation), so this
// filters client-side over the current page only; fine at this registry's
// current size.
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
      <h1 className="mb-4 text-lg font-bold text-ink">السائقون</h1>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث باسم السائق"
        className="mb-4 w-72 rounded border border-slate-300 px-2 py-1"
      />

      {isLoading && <p className="text-slate-500">...جارٍ التحميل</p>}
      {isError && <p className="text-danger">تعذر تحميل قائمة السائقين.</p>}

      {filtered && (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="p-2 text-start">الاسم</th>
                <th className="p-2 text-start">رقم الهوية</th>
                <th className="p-2 text-start">الهاتف</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((driver) => (
                <tr key={driver.id} className="border-b border-slate-100">
                  <td className="p-2">
                    <Link to={`/drivers/${driver.id}`} className="text-primary hover:underline">
                      {driver.fullName}
                    </Link>
                  </td>
                  <td className="p-2">
                    <LtrText>{maskIdentityNumber(driver.identityNumber, permissions)}</LtrText>
                  </td>
                  <td className="p-2">{driver.phone ?? '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-slate-500">
                    لا يوجد سائقون مطابقون
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <PrevNext skip={skip} take={TAKE} rowCount={data?.length ?? 0} onSkipChange={setSkip} />
        </>
      )}
    </div>
  );
}
