import { useStations } from './useStations';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';

const STATUS_VARIANT: Record<string, 'ok' | 'neutral' | 'danger'> = {
  ACTIVE: 'ok',
  INACTIVE: 'neutral',
  SUSPENDED: 'danger',
};

// Minimal browse screen (item 3) — GET /stations is already server-side
// scoped, so this only ever lists stations the caller can see, same as
// StationSelect. Read-only: no create/edit/delete here (that's
// StationsAdminPage, under /admin).
export function StationsListPage() {
  const { data: stations, isLoading, isError } = useStations();

  return (
    <div>
      <PageHeader title="المحطات" subtitle={stations ? `${stations.length} محطة` : undefined} />

      {isLoading && <p className="text-[13px] text-ink-soft">...جارٍ التحميل</p>}
      {isError && <p className="text-[13px] text-danger">تعذر تحميل قائمة المحطات.</p>}

      {stations && (
        <Card>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-surface-alt text-[11px] font-bold text-ink-soft">
                <th className="px-[18px] py-2.5 text-start">الاسم</th>
                <th className="px-[18px] py-2.5 text-start">الرمز الداخلي</th>
                <th className="px-[18px] py-2.5 text-start">رقم المحطة</th>
                <th className="px-[18px] py-2.5 text-start">البلدية</th>
                <th className="px-[18px] py-2.5 text-start">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {stations.map((station) => (
                <tr key={station.id} className="border-b border-surface-alt last:border-0">
                  <td className="px-[18px] py-3 font-medium text-ink">{station.name}</td>
                  <td className="px-[18px] py-3">
                    <CodeText>{station.internalCode}</CodeText>
                  </td>
                  <td className="px-[18px] py-3">
                    <CodeText>{station.stationNumber}</CodeText>
                  </td>
                  <td className="px-[18px] py-3 text-ink">{station.municipality ?? '—'}</td>
                  <td className="px-[18px] py-3">
                    <StatusPill variant={STATUS_VARIANT[station.status] ?? 'neutral'}>{station.status}</StatusPill>
                  </td>
                </tr>
              ))}
              {stations.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-[13px] text-ink-soft">
                    لا توجد محطات ضمن صلاحياتك
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
