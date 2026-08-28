import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';
import { formatLicensePlate, normalizePlateSearchTerm } from '../../lib/libyanFormats';
import { PrevNext } from '../../components/PrevNext';
import { LtrText } from '../../components/LtrText';
import type { VehicleBasicInfo } from './types';

const TAKE = 20;

// Minimal browse screen (item 3) — GET /vehicles isn't station-scoped
// (vehicles are a directorate-wide registry, not owned by a station; only
// fill-ups carry a stationId), so this lists every vehicle the caller's
// vehicles:read permission allows, same as the rest of the vehicle
// endpoints. Read-only: no create/edit/delete here.
//
// Search box added per item 11 — search should be embedded in the list it
// searches, not a separate "بحث" page nobody thinks to visit; the
// standalone lookup page has been retired in favor of this.
export function VehiclesListPage() {
  const [skip, setSkip] = useState(0);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(normalizePlateSearchTerm(query));
      setSkip(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['vehicles', 'list', skip, debounced],
    queryFn: async () =>
      (
        await apiClient.get<VehicleBasicInfo[]>('/vehicles', {
          params: { skip, take: TAKE, search: debounced || undefined },
        })
      ).data,
  });

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold text-ink">المركبات</h1>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث برقم اللوحة أو الرمز الداخلي"
        dir="ltr"
        className="mb-4 w-72 rounded border border-slate-300 px-2 py-1 text-end"
      />

      {isLoading && <p className="text-slate-500">...جارٍ التحميل</p>}
      {isError && <p className="text-danger">تعذر تحميل قائمة المركبات.</p>}

      {data && (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="p-2 text-start">الرمز الداخلي</th>
                <th className="p-2 text-start">رقم اللوحة</th>
                <th className="p-2 text-start">النوع</th>
                <th className="p-2 text-start">الطراز</th>
              </tr>
            </thead>
            <tbody>
              {data.map((vehicle) => (
                <tr key={vehicle.id} className="border-b border-slate-100">
                  <td className="p-2">
                    <Link to={`/vehicles/${vehicle.id}`} className="text-primary hover:underline">
                      {vehicle.internalCode}
                    </Link>
                  </td>
                  <td className="p-2">
                    <LtrText>{formatLicensePlate(vehicle.currentPlate)}</LtrText>
                  </td>
                  <td className="p-2">{vehicle.vehicleType ?? '—'}</td>
                  <td className="p-2">{vehicle.model ?? '—'}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-slate-500">
                    لا توجد مركبات مطابقة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <PrevNext skip={skip} take={TAKE} rowCount={data.length} onSkipChange={setSkip} />
        </>
      )}
    </div>
  );
}
