import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/design/PageHeader';
import { PlaceSummaryRow } from './MunicipalitySummary';
import { PillButton } from '../../components/design/PillButton';
import { Icon, ICONS } from '../../components/icons';
import { useAuth } from '../auth/AuthProvider';
import { Notice } from '../users/parts';
import { PlacesList } from './PlacesList';
import { useMunicipalityList } from './placesShared';

const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px] sm:w-72';

// «إدارة المحطات» — every petrol station and registration office of the
// municipality in ONE list, with a type filter, search, status / company /
// locality filters and sortable columns, 25 a page (the same list as the
// «المحطات والمكاتب» tab of a municipality's page). Rows open the station or
// office, where its people, controls and activity are.
export function ManagePlacesPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const canCreateStation = hasPermission('stations:create');
  const canCreateOffice = hasPermission('registration_stations:manage');

  const municipalities = useMunicipalityList();
  const choices = municipalities.data ?? [];
  const [chosenId, setChosenId] = useState('');
  const municipality = choices.find((m) => m.id === chosenId) ?? choices[0] ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="إدارة المحطات"
        subtitle={municipality ? `محطات الوقود ومكاتب التسجيل في ${municipality.name}` : 'محطات الوقود ومكاتب التسجيل'}
        actions={
          <>
            {canCreateStation && (
              <PillButton size="field" onClick={() => navigate('/manage/stations/new')}>
                <span className="inline-flex items-center gap-2">
                  <Icon d={ICONS.plus} size={18} />
                  محطة وقود جديدة
                </span>
              </PillButton>
            )}
            {canCreateOffice && (
              <PillButton size="field" variant="secondary" onClick={() => navigate('/manage/offices/new')}>
                <span className="inline-flex items-center gap-2">
                  <Icon d={ICONS.plus} size={18} />
                  مكتب تسجيل جديد
                </span>
              </PillButton>
            )}
          </>
        }
      />

      {choices.length > 1 && (
        <div>
          <label htmlFor="mp-muni" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">البلدية</label>
          <select id="mp-muni" value={municipality?.id ?? ''} onChange={(e) => setChosenId(e.target.value)} className={SELECT_CLASS}>
            {choices.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}

      <PlaceSummaryRow municipalityId={municipality?.id} />

      {municipalities.isError && <Notice kind="error">تعذّر تحميل البلدية. تأكد من الاتصال ثم أعد المحاولة.</Notice>}
      {municipality && (
        <PlacesList
          key={municipality.id}
          municipalityId={municipality.id}
          emptyHint="أضف أول محطة وقود أو مكتب تسجيل من الأزرار أعلاه."
        />
      )}
    </div>
  );
}
