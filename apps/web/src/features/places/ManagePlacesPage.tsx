import { useState } from 'react';
import { PageHeader } from '../../components/design/PageHeader';
import { PlaceSummaryRow } from './MunicipalitySummary';
import { Notice } from '../users/parts';
import { PlacesTabs } from './PlacesList';
import { useMunicipalityList } from './placesShared';

const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px] sm:w-72';

// «إدارة المحطات» — the petrol stations and the registration offices of the
// municipality, in two tabs (Phase 7: they were one mixed list), each with its
// own search, filters, sortable columns, 25 a page, and its own «إضافة» button
// (the same tabs as the «المحطات والمكاتب» tab of a municipality's page). Rows
// open the station or office, where its people, controls and activity are.
export function ManagePlacesPage() {

  const municipalities = useMunicipalityList();
  const choices = municipalities.data ?? [];
  const [chosenId, setChosenId] = useState('');
  const municipality = choices.find((m) => m.id === chosenId) ?? choices[0] ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="إدارة المحطات"
        subtitle={municipality ? `محطات الوقود ومكاتب التسجيل في ${municipality.name}` : 'محطات الوقود ومكاتب التسجيل'}
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
        <PlacesTabs key={municipality.id} municipalityId={municipality.id} />
      )}
    </div>
  );
}
