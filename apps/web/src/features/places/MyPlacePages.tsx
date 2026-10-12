import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { FUEL_TYPE_LABELS, STATION_STATUS_LABELS, STATION_STATUS_VARIANT } from '../../lib/labels';
import { PageHeader } from '../../components/design/PageHeader';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { adminErrorMessage } from '../admin/adminErrors';
import { RegistrationDesksEditor } from '../admin/RegistrationDesksEditor';
import { useAuth } from '../auth/AuthProvider';
import { Notice, SectionCard } from '../users/parts';
import { UsersListPage } from '../users/UsersListPage';
import {
  ActivityCard,
  OFFICE_STATUS_LABELS,
  OFFICE_STATUS_VARIANT,
  useOfficeList,
  usePlaceActivity,
  useStationList,
  type OfficeRow,
  type StationRow,
} from './placesShared';

const SELECT_CLASS =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface sm:w-96 lg:h-11 lg:text-[14px]';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[14px] text-ink-soft lg:text-[12px]">{label}</dt>
      <dd className="text-[17px] font-bold text-ink lg:text-[15px]">{children}</dd>
    </div>
  );
}

// «محطتي» — the station supervisor's own station: what it is, the fuel types
// it sells (the one thing a supervisor controls about it), its employees, and
// what happened there. The supervisor reaches their own station(s) only.
export function MyStationPage() {
  const stations = useStationList({});
  const [chosen, setChosen] = useState('');
  const list = stations.data ?? [];
  const station: StationRow | undefined = list.length === 1 ? list[0] : list.find((s) => s.id === chosen);

  if (stations.isLoading) return <p className="p-4 text-[15px] text-ink-soft">جارٍ التحميل…</p>;
  if (stations.isError) return <Notice kind="error">تعذّر تحميل محطتك. تأكد من الاتصال ثم أعد المحاولة.</Notice>;
  if (list.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="محطتي" />
        <Notice kind="info">حسابك غير مرتبط بأي محطة. تواصل مع مدير البلدية.</Notice>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="محطتي" subtitle="موظفو المحطة والوقود الذي تبيعه والنشاط" />
      {list.length > 1 && (
        <div>
          <label htmlFor="my-station" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">المحطة</label>
          <select id="my-station" value={chosen} onChange={(e) => setChosen(e.target.value)} className={SELECT_CLASS}>
            <option value="">اختر محطتك</option>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {station ? <MyStation station={station} /> : <Notice kind="info">اختر المحطة أولًا.</Notice>}
    </div>
  );
}

function MyStation({ station }: { station: StationRow }) {
  const queryClient = useQueryClient();
  const activity = usePlaceActivity('stations', station.id);
  const available = station.fuelAvailability.filter((f) => f.isAvailable).map((f) => f.fuelType);
  const [fuelTypes, setFuelTypes] = useState<string[]>(available);
  const [saved, setSaved] = useState(false);
  useEffect(() => setFuelTypes(available), [station.id, available.join(',')]);

  const save = useMutation({
    mutationFn: async () => apiClient.patch(`/stations/${station.id}`, { fuelTypes }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['stations'] });
    },
  });
  const changed = fuelTypes.length !== available.length || fuelTypes.some((f) => !available.includes(f));

  return (
    <>
      <header className="rounded-md bg-surface p-4 shadow-sm lg:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] font-extrabold leading-tight text-ink lg:text-xl">{station.name}</h2>
            <CodeText size="md">{station.internalCode}</CodeText>
          </div>
          <StatusPill variant={STATION_STATUS_VARIANT[station.status] ?? 'neutral'} size="md">
            {STATION_STATUS_LABELS[station.status] ?? station.status}
          </StatusPill>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Fact label="الشركة">{station.company?.name ?? '—'}</Fact>
          <Fact label="البلدية">{station.municipality?.name ?? '—'}</Fact>
          <Fact label="رقم المحطة">
            <span dir="ltr">{station.stationNumber}</span>
          </Fact>
        </dl>
      </header>

      <SectionCard title="الوقود الذي تبيعه المحطة" description="هذا ما تتحكم به أنت في محطتك. بقية بيانات المحطة لمدير البلدية.">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {Object.entries(FUEL_TYPE_LABELS).map(([value, label]) => {
              const checked = fuelTypes.includes(value);
              return (
                <label
                  key={value}
                  className={`flex min-h-[48px] cursor-pointer items-center gap-2 rounded-full border-2 px-4 text-[16px] font-bold lg:min-h-[40px] lg:text-[14px] ${
                    checked ? 'border-primary bg-primary-100 text-primary-dark' : 'border-line text-ink-soft'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setSaved(false);
                      setFuelTypes(e.target.checked ? [...fuelTypes, value] : fuelTypes.filter((f) => f !== value));
                    }}
                    className="h-5 w-5 accent-primary"
                  />
                  {label}
                </label>
              );
            })}
          </div>
          {save.isError && <Notice kind="error">{adminErrorMessage(save.error, 'تعذّر حفظ أنواع الوقود.')}</Notice>}
          {saved && <Notice kind="success">تم حفظ أنواع الوقود.</Notice>}
          <PillButton size="field" disabled={!changed || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'جارٍ الحفظ…' : 'حفظ أنواع الوقود'}
          </PillButton>
          <p className="text-[14px] text-ink-soft lg:text-[12px]">سعة التخزين لكل نوع وقود تُضاف لاحقًا في هذه الصفحة.</p>
        </div>
      </SectionCard>

      <UsersListPage
        basePath="/people"
        fixedPlaceId={station.id}
        title="موظفو المحطة"
        createParams={{ kind: 'PETROL_STATION', place: station.id, placeName: station.name }}
        emptyText="لا يوجد موظفون في محطتك بعد. أنشئ أول حساب وسيظهر هنا."
      />

      <ActivityCard
        activity={activity.data}
        loading={activity.isLoading}
        summary={
          activity.data && (
            <p className="mb-3 text-[16px] text-ink lg:text-[14px]">
              تعبئات آخر 30 يومًا: <span className="font-extrabold">{activity.data.fillUpsLast30Days ?? 0}</span>
            </p>
          )
        }
      />
    </>
  );
}

// «مكتبي» — the office manager's own office: its details, desks and printers,
// card stock, its employees, and what happened there.
export function MyOfficePage() {
  const { hasPermission } = useAuth();
  const offices = useOfficeList({});
  const [chosen, setChosen] = useState('');
  const list = offices.data ?? [];
  const office: OfficeRow | undefined = list.length === 1 ? list[0] : list.find((o) => o.id === chosen);
  const activity = usePlaceActivity('registration-stations', office?.id);

  if (offices.isLoading) return <p className="p-4 text-[15px] text-ink-soft">جارٍ التحميل…</p>;
  if (offices.isError) return <Notice kind="error">تعذّر تحميل مكتبك. تأكد من الاتصال ثم أعد المحاولة.</Notice>;
  if (list.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="مكتبي" />
        <Notice kind="info">حسابك غير مرتبط بأي مكتب تسجيل. تواصل مع مدير البلدية.</Notice>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="مكتبي" subtitle="موظفو المكتب والمكاتب والطابعات ومخزون البطاقات" />
      {list.length > 1 && (
        <div>
          <label htmlFor="my-office" className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">المكتب</label>
          <select id="my-office" value={chosen} onChange={(e) => setChosen(e.target.value)} className={SELECT_CLASS}>
            <option value="">اختر مكتبك</option>
            {list.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {!office ? (
        <Notice kind="info">اختر المكتب أولًا.</Notice>
      ) : (
        <>
          <header className="rounded-md bg-surface p-4 shadow-sm lg:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[22px] font-extrabold leading-tight text-ink lg:text-xl">{office.name}</h2>
                <CodeText size="md">{office.internalCode}</CodeText>
              </div>
              <StatusPill variant={OFFICE_STATUS_VARIANT[office.status]} size="md">
                {OFFICE_STATUS_LABELS[office.status]}
              </StatusPill>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Fact label="البلدية">{office.municipality.name}</Fact>
              <Fact label="العنوان">{office.address}</Fact>
              {office.workingHours && <Fact label="ساعات العمل">{office.workingHours}</Fact>}
            </dl>
          </header>

          {hasPermission('registration_desks:manage') && (
            <SectionCard title="المكاتب والطابعات" description="مكتب الموظف والطابعة المتصلة به؛ كل بطاقة تسجّل المكتب الذي طُبعت عليه.">
              <RegistrationDesksEditor registrationStationId={office.id} />
            </SectionCard>
          )}

          {(hasPermission('card_stock:read') || hasPermission('registration_reports:view')) && (
            <SectionCard title="المخزون والمتابعة">
              <div className="flex flex-col gap-2.5 lg:flex-row">
                {hasPermission('card_stock:read') && (
                  <Link to="/reports/card-stock">
                    <PillButton size="field" variant="secondary">مخزون البطاقات</PillButton>
                  </Link>
                )}
                {hasPermission('registration_reports:view') && (
                  <Link to="/reports/registration">
                    <PillButton size="field" variant="secondary">متابعة المكتب وموظفيه</PillButton>
                  </Link>
                )}
              </div>
            </SectionCard>
          )}

          <UsersListPage
            basePath="/people"
            fixedPlaceId={office.id}
            title="موظفو المكتب"
            createParams={{ kind: 'REGISTRATION', place: office.id, placeName: office.name }}
            emptyText="لا يوجد موظفو تسجيل في مكتبك بعد. أنشئ أول حساب وسيظهر هنا."
          />

          <ActivityCard
            activity={activity.data}
            loading={activity.isLoading}
            summary={
              activity.data && (
                <p className="mb-3 text-[16px] text-ink lg:text-[14px]">
                  آخر 30 يومًا: مركبات مسجّلة <span className="font-extrabold">{activity.data.vehiclesLast30Days ?? 0}</span> · بطاقات
                  مُصدرة <span className="font-extrabold">{activity.data.cardsLast30Days ?? 0}</span>
                </p>
              )
            }
          />
        </>
      )}
    </div>
  );
}
