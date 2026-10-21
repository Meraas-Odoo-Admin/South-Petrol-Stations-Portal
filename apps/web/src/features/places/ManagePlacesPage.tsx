import { useState } from 'react';
import { PageHeader } from '../../components/design/PageHeader';
import { TabPanel, Tabs, useTab, type TabDef } from '../../components/design/Tabs';
import { PlaceSummaryRow } from './MunicipalitySummary';
import { Notice } from '../users/parts';
import { PlacesList } from './PlacesList';
import { useMunicipalityList } from './placesShared';
import { UsersListPage } from '../users/UsersListPage';

const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark focus:ring-offset-2 focus:ring-offset-surface lg:h-11 lg:text-[14px] sm:w-72';

// After review (Khalil, 21 Oct 2026): two menu items instead of one mixed
// page — «إدارة المحطات» and «إدارة مكاتب التسجيل». Each has two parts:
//  - the places (search, filters, sortable columns, 25 a page, «إضافة»);
//  - their supervisors, each with every place they oversee. A supervisor
//    oversees a GROUP of places, and is created with all of them at once
//    («إضافة مشرف»); a place may have more than one supervisor.
// Rows open the place or the person, where everything else is.
const SIDES = {
  STATION: {
    title: 'إدارة المحطات',
    placesTab: 'المحطات',
    peopleTab: 'المشرفون',
    peopleTitle: 'مشرفو المحطات',
    subtitle: (m: string) => `محطات الوقود في ${m} ومشرفوها`,
    side: 'PETROL_STATION' as const,
    summary: 'fuel' as const,
    peopleEmpty: 'لا يوجد مشرفو محطات بعد. أضف مشرفًا واختر له محطاته.',
  },
  OFFICE: {
    title: 'إدارة مكاتب التسجيل',
    placesTab: 'المكاتب',
    peopleTab: 'المشرفون',
    peopleTitle: 'مديرو مكاتب التسجيل',
    subtitle: (m: string) => `مكاتب التسجيل في ${m} ومديروها`,
    side: 'REGISTRATION' as const,
    summary: 'registration' as const,
    peopleEmpty: 'لا يوجد مديرو مكاتب بعد. أضف مديرًا واختر له مكاتبه.',
  },
};

function ManageSidePage({ kind }: { kind: 'STATION' | 'OFFICE' }) {
  const words = SIDES[kind];
  const municipalities = useMunicipalityList();
  const choices = municipalities.data ?? [];
  const [chosenId, setChosenId] = useState('');
  const municipality = choices.find((m) => m.id === chosenId) ?? choices[0] ?? null;
  const tabs: TabDef[] = [
    { key: 'places', label: words.placesTab },
    { key: 'people', label: words.peopleTab },
  ];
  const [tab, setTab] = useTab(tabs, 'part');

  return (
    <div className="space-y-4">
      <PageHeader title={words.title} subtitle={municipality ? words.subtitle(municipality.name) : undefined} />

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

      <PlaceSummaryRow municipalityId={municipality?.id} only={words.summary} />

      {municipalities.isError && <Notice kind="error">تعذّر تحميل البلدية. تأكد من الاتصال ثم أعد المحاولة.</Notice>}
      {municipality && (
        <div data-testid={`manage-${kind.toLowerCase()}`}>
          <Tabs tabs={tabs} value={tab} onChange={setTab} label={words.title} />
          <TabPanel tab="places" value={tab}>
            <PlacesList key={`${municipality.id}-${kind}`} municipalityId={municipality.id} kind={kind} />
          </TabPanel>
          <TabPanel tab="people" value={tab}>
            <UsersListPage
              key={`${municipality.id}-${kind}-people`}
              basePath="/people"
              title={words.peopleTitle}
              fixedSide={words.side}
              supervisorsOnly
              municipalityId={municipality.id}
              createParams={{ kind: words.side, supervisor: '1' }}
              createLabel={kind === 'STATION' ? 'إضافة مشرف' : 'إضافة مدير مكتب'}
              emptyText={words.peopleEmpty}
            />
          </TabPanel>
        </div>
      )}
    </div>
  );
}

// «إدارة المحطات».
export function ManagePlacesPage() {
  return <ManageSidePage kind="STATION" />;
}

// «إدارة مكاتب التسجيل».
export function ManageOfficesPage() {
  return <ManageSidePage kind="OFFICE" />;
}
