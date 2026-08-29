import { useStations } from './useStations';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { STATION_STATUS_VARIANT, stationStatusLabel } from '../../lib/labels';

// Minimal browse screen (item 3) — GET /stations is already server-side
// scoped, so this only ever lists stations the caller can see, same as
// StationSelect. Read-only: no create/edit/delete here (that's
// StationsAdminPage, under /admin). Matches 8f — one shared shell for
// desktop and mobile, table on wide viewports and a stacked card list
// below the sm breakpoint (a plain <table> would overflow at 390px).
export function StationsListPage() {
  const { data: stations, isLoading, isError } = useStations();

  return (
    <div>
      <PageHeader title="المحطات" subtitle={stations ? `${stations.length} محطة` : undefined} />

      {isLoading && <p className="text-[13px] text-ink-soft">...جارٍ التحميل</p>}
      {isError && <p className="text-[13px] text-danger">تعذر تحميل قائمة المحطات.</p>}

      {stations && (
        <>
          {/* Mobile: card list */}
          <div className="space-y-2.5 sm:hidden">
            {stations.map((station) => (
              <Card key={station.id} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13.5px] font-bold text-ink">{station.name}</p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">{station.municipality ?? '—'}</p>
                  </div>
                  <StatusPill variant={STATION_STATUS_VARIANT[station.status] ?? 'neutral'}>
                    {stationStatusLabel(station.status)}
                  </StatusPill>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-soft">
                  <span>
                    الرمز الداخلي: <CodeText>{station.internalCode}</CodeText>
                  </span>
                  <span>
                    رقم المحطة: <CodeText>{station.stationNumber}</CodeText>
                  </span>
                </div>
              </Card>
            ))}
            {stations.length === 0 && (
              <Card className="p-4 text-center text-[13px] text-ink-soft">لا توجد محطات ضمن صلاحياتك</Card>
            )}
          </div>

          {/* Desktop: table */}
          <Card className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[12.5px]">
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
                        <StatusPill variant={STATION_STATUS_VARIANT[station.status] ?? 'neutral'}>
                          {stationStatusLabel(station.status)}
                        </StatusPill>
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
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
