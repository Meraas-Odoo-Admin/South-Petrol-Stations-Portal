import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { FUEL_TYPE_LABELS } from '../../lib/labels';
import { FieldLabel } from '../../components/design/TextField';
import { ErrorNote, Loading, PdfButton, RangeBar, useRange } from '../regreports/common';
import { OpsTableView, type OpsReport } from './OpsReportView';
import { usePageParam } from '../../lib/usePageParam';
import { PAGE } from './OpsReportView';

// One report of phase 5B with its filters: a date range (Tripoli days) and the
// few filters that report has. Every filter goes to the API, which checks it
// against the caller's scope; this screen only asks.

// 'supply': «التوريد والتعبئة» of «مراقبة المحطات» (after review, 21 Oct 2026).
export type OpsReportKey = 'my-shift' | 'my-day' | 'office' | 'station' | 'municipality' | 'summary' | 'supply';

const SELECT =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3.5 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-primary-dark lg:h-10 lg:text-[14px]';

const IDENTIFICATIONS: Array<[string, string]> = [
  ['CARD_SCAN', 'بطاقة'],
  ['TYPED_REGISTERED', 'لوحة مكتوبة (مسجّلة)'],
  ['TYPED_UNREGISTERED', 'لوحة غير مسجّلة'],
  ['EMERGENCY_OVERRIDE', 'تجاوز طارئ'],
];
const CARD_REASONS: Array<[string, string]> = [
  ['FIRST_ISSUE', 'أول بطاقة'],
  ['LOST', 'بدل فاقد'],
  ['DAMAGED', 'بدل تالف'],
  ['FAILED_PRINT', 'إعادة طباعة'],
  ['DETAILS_CHANGED', 'تغيّر البيانات'],
];

const HAS_RANGE: Record<OpsReportKey, boolean> = {
  'my-shift': false,
  'my-day': true,
  office: true,
  station: true,
  municipality: true,
  summary: true,
  supply: true,
};

function Select({
  id,
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
  allLabel: string;
}) {
  return (
    <div className="col-span-2 lg:col-span-1 lg:w-56">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select id={id} className={SELECT} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

export function OpsReportPanel({
  report,
  fixedMunicipalityId,
  fixedStationId,
  fixedOfficeId,
}: {
  report: OpsReportKey;
  /** Set where the municipality is already chosen (the super admin's page of one municipality). */
  fixedMunicipalityId?: string;
  /** Set on a station's own page: the report is about that station only. */
  fixedStationId?: string;
  /** Set on an office's own page. */
  fixedOfficeId?: string;
}) {
  const [range, setRange] = useRange(report === 'municipality' || report === 'summary' ? 7 : report === 'my-day' ? 1 : 7);
  const [municipalityId, setMunicipalityId] = useState(fixedMunicipalityId ?? '');
  const [stationId, setStationId] = useState(fixedStationId ?? '');
  const [fuelType, setFuelType] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [identification, setIdentification] = useState('');
  const [cardReason, setCardReason] = useState('');
  // One report table is shown at a time (UX round): a chooser above lists them,
  // the chosen one is in the address (?table=; ?report= already names the report), and its page is (?page=).
  const [searchParams, setSearchParams] = useSearchParams();
  const chosenTable = searchParams.get('table');
  const { skip, setSkip } = usePageParam(PAGE);

  const params: Record<string, string | undefined> = {
    // No range in the address yet: the server picks it (from the activation day).
    ...(HAS_RANGE[report] && searchParams.get('from') ? range : {}),
    municipalityId: fixedMunicipalityId ?? (municipalityId || undefined),
    stationId: fixedStationId ?? (stationId || undefined),
    officeId: fixedOfficeId,
    fuelType: fuelType || undefined,
    employeeId: employeeId || undefined,
    identification: identification || undefined,
    cardReason: cardReason || undefined,
  };
  // The report's own figures and tables are fetched with the filters only (first
  // page of every table, for the chooser); each table then pages itself.

  const query = useQuery({
    queryKey: ['ops-report', report, params],
    queryFn: async () => (await apiClient.get<OpsReport>(`/ops-reports/${report}`, { params })).data,
    placeholderData: (prev) => prev,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const data = query.data;
  const shownRange = searchParams.get('from') ? range : (data?.range ?? range);

  // The people the report can be narrowed to: the complete list from the
  // server, so choosing one does not remove the others.
  const employeeChoices: Array<[string, string]> = (data?.employees ?? []).map((e) => [e.id, e.name]);

  const showStation = !fixedStationId && (report === 'station' || report === 'municipality' || report === 'supply') && (data?.subject.length ?? 0) > 1;
  const stationOptions: Array<[string, string]> = (data?.subject ?? []).map((s) => [s.id, s.name]);
  const showFuel = report === 'station' || report === 'municipality' || report === 'supply';
  const showEmployee = (report === 'station' || report === 'office') && employeeChoices.length > 0;
  const showMunicipality = (report === 'municipality' || report === 'supply') && !fixedMunicipalityId && (data?.municipalities?.length ?? 0) > 1;
  const subject = fixedStationId || fixedOfficeId ? undefined : data?.subject.map((s) => s.name).join('، ');
  const shownTable = data?.tables.find((t) => t.id === chosenTable) ?? data?.tables[0];

  return (
    <div>
      {HAS_RANGE[report] ? (
        <RangeBar
          range={shownRange}
          onChange={setRange}
          extra={
            <>
              {showMunicipality && (
                <Select
                  id="ops-municipality"
                  label="البلدية"
                  value={municipalityId || data?.subject[0]?.id || ''}
                  onChange={(v) => {
                    setMunicipalityId(v);
                    setStationId('');
                  }}
                  options={(data?.municipalities ?? []).map((m) => [m.id, m.name])}
                  allLabel="البلدية الأولى"
                />
              )}
              {showStation && (
                <Select id="ops-station" label="المحطة" value={stationId} onChange={setStationId} options={stationOptions} allLabel="كل المحطات" />
              )}
              {showFuel && (
                <Select
                  id="ops-fuel"
                  label="نوع الوقود"
                  value={fuelType}
                  onChange={setFuelType}
                  options={Object.entries(FUEL_TYPE_LABELS)}
                  allLabel="كل الأنواع"
                />
              )}
              {report === 'station' && (
                <Select
                  id="ops-identification"
                  label="طريقة التعريف"
                  value={identification}
                  onChange={setIdentification}
                  options={IDENTIFICATIONS}
                  allLabel="كل الطرق"
                />
              )}
              {report === 'office' && (
                <Select id="ops-card-reason" label="سبب البطاقة" value={cardReason} onChange={setCardReason} options={CARD_REASONS} allLabel="كل الأسباب" />
              )}
              {showEmployee && (
                <Select
                  id="ops-employee"
                  label="الموظف"
                  value={employeeId}
                  onChange={setEmployeeId}
                  options={employeeChoices}
                  allLabel="كل الموظفين"
                />
              )}
            </>
          }
        />
      ) : (
        <p className="mb-4 rounded-md bg-surface p-4 text-[16px] text-ink-soft shadow-sm lg:text-[14px]">
          هذا تقرير مناوبتك اليوم، بتوقيت طرابلس.
        </p>
      )}

      {query.isLoading && <Loading />}
      {query.isError && <ErrorNote error={query.error} />}
      {data && (
        <>
          {(subject || report === 'office') && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              {subject ? <p className="text-[15px] font-bold text-primary-dark lg:text-[13px]">{subject}</p> : <span />}
              {report === 'office' && (
                <PdfButton
                  path="/reports/registration/offices/export"
                  params={{ from: shownRange.from, to: shownRange.to, officeId: fixedOfficeId ?? (params.officeId || undefined) }}
                  filename={`registration-office_${shownRange.from}_${shownRange.to}.pdf`}
                />
              )}
            </div>
          )}
          {data.tables.length > 1 && (
            <div role="tablist" aria-label="اختر التقرير" className="scrollbar-none mb-4 flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible" data-testid="ops-report-chooser">
              {data.tables.map((table) => {
                const active = table.id === shownTable?.id;
                return (
                  <button
                    key={table.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-testid={`ops-report-${table.id}`}
                    onClick={() =>
                      setSearchParams(
                        (prev) => {
                          const next = new URLSearchParams(prev);
                          next.set('table', table.id);
                          next.delete('page');
                          return next;
                        },
                        { replace: true },
                      )
                    }
                    className={`min-h-[44px] shrink-0 rounded-full px-4 text-[15px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark lg:min-h-[40px] lg:text-[13px] ${
                      active ? 'bg-primary text-white' : 'bg-surface-alt text-ink-soft hover:bg-primary-100 hover:text-primary'
                    }`}
                  >
                    {table.title}
                  </button>
                );
              })}
            </div>
          )}
          {shownTable && (
            <OpsTableView
              key={shownTable.id}
              table={shownTable}
              reportName={report}
              query={params}
              page={{ skip, setSkip }}
            />
          )}
        </>
      )}
    </div>
  );
}
