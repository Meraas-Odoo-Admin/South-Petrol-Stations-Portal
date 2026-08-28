import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { apiClient } from '../../lib/apiClient';
import { Card, CardHeader } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { useStations } from '../stations/useStations';

interface CompanyRow {
  id: string;
  name: string;
}

type StationStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

const STATUS_VARIANT: Record<StationStatus, 'ok' | 'neutral' | 'danger'> = {
  ACTIVE: 'ok',
  INACTIVE: 'neutral',
  SUSPENDED: 'danger',
};

// Item 7's explicit ask: confirmed no station create/edit UI existed
// anywhere before this — POST/PATCH /stations were already built
// (stations:manage) with nothing pointing at them from the frontend. Kept
// separate from the read-only StationsListPage (still used by
// non-admin stations:read holders) rather than adding edit controls there,
// since that page is reachable by roles that only ever hold stations:read.
// Not mocked in 2i — extends the same card/table/pill vocabulary.
export function StationsAdminPage() {
  const queryClient = useQueryClient();
  const { data: stations, isLoading, isError } = useStations();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [internalCode, setInternalCode] = useState('');
  const [stationNumber, setStationNumber] = useState('');
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [municipality, setMunicipality] = useState('');

  const [editName, setEditName] = useState('');
  const [editMunicipality, setEditMunicipality] = useState('');
  const [editStatus, setEditStatus] = useState<StationStatus>('ACTIVE');

  const companiesQuery = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: async () => (await apiClient.get<CompanyRow[]>('/companies')).data,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['stations'] });

  const inputClass =
    'h-9 rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent';

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/stations', {
        internalCode,
        stationNumber,
        name,
        companyId,
        municipality: municipality || undefined,
      }),
    onSuccess: () => {
      setError(null);
      setShowCreate(false);
      setInternalCode('');
      setStationNumber('');
      setName('');
      setCompanyId('');
      setMunicipality('');
      invalidate();
    },
    onError: (err) => {
      setError(
        isAxiosError<{ message?: string | string[] }>(err)
          ? [err.response?.data?.message].flat().filter(Boolean).join(' — ') || 'تعذر إضافة المحطة.'
          : 'تعذر إضافة المحطة.',
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.patch(`/stations/${id}`, {
        name: editName,
        municipality: editMunicipality || undefined,
        status: editStatus,
      }),
    onSuccess: () => {
      setError(null);
      setEditingId(null);
      invalidate();
    },
    onError: () => setError('تعذر تحديث المحطة.'),
  });

  return (
    <div className="space-y-4">
      {showCreate && (
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">الرمز الداخلي</label>
              <input value={internalCode} onChange={(e) => setInternalCode(e.target.value)} dir="ltr" className={`w-40 ${inputClass}`} />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">رقم المحطة</label>
              <input value={stationNumber} onChange={(e) => setStationNumber(e.target.value)} dir="ltr" className={`w-32 ${inputClass}`} />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">الاسم</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={`w-56 ${inputClass}`} />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">الشركة</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`w-56 ${inputClass}`}>
                <option value="">اختر الشركة</option>
                {companiesQuery.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] text-ink-soft">البلدية (اختياري)</label>
              <input value={municipality} onChange={(e) => setMunicipality(e.target.value)} className={`w-40 ${inputClass}`} />
            </div>
            <PillButton
              disabled={!internalCode || !stationNumber || !name || !companyId || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              حفظ
            </PillButton>
          </div>
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <CardHeader
          title="المحطات"
          subtitle={stations ? `${stations.length} محطة` : undefined}
          action={
            <PillButton size="sm" onClick={() => setShowCreate((s) => !s)}>
              {showCreate ? 'إلغاء' : 'محطة جديدة +'}
            </PillButton>
          }
        />

        {isLoading && <p className="p-4 text-sm text-ink-soft">...جارٍ التحميل</p>}
        {isError && <p className="p-4 text-sm text-danger">تعذر تحميل قائمة المحطات.</p>}

        {stations && (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-surface-alt text-[11px] font-bold text-ink-soft">
                <th className="px-[18px] py-2.5 text-start">الاسم</th>
                <th className="px-[18px] py-2.5 text-start">الرمز الداخلي</th>
                <th className="px-[18px] py-2.5 text-start">رقم المحطة</th>
                <th className="px-[18px] py-2.5 text-start">البلدية</th>
                <th className="px-[18px] py-2.5 text-start">الحالة</th>
                <th className="px-[18px] py-2.5 text-start"></th>
              </tr>
            </thead>
            <tbody>
              {stations.map((station) => (
                <Fragment key={station.id}>
                  <tr className="border-b border-surface-alt last:border-0">
                    <td className="px-[18px] py-3 font-medium text-ink">{station.name}</td>
                    <td className="px-[18px] py-3">
                      <CodeText>{station.internalCode}</CodeText>
                    </td>
                    <td className="px-[18px] py-3">
                      <CodeText>{station.stationNumber}</CodeText>
                    </td>
                    <td className="px-[18px] py-3 text-ink">{station.municipality ?? '—'}</td>
                    <td className="px-[18px] py-3">
                      <StatusPill variant={STATUS_VARIANT[(station.status as StationStatus) ?? 'ACTIVE']}>
                        {station.status}
                      </StatusPill>
                    </td>
                    <td className="px-[18px] py-3">
                      <PillButton
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (editingId === station.id) {
                            setEditingId(null);
                            return;
                          }
                          setEditingId(station.id);
                          setEditName(station.name);
                          setEditMunicipality(station.municipality ?? '');
                          setEditStatus((station.status as StationStatus) ?? 'ACTIVE');
                        }}
                      >
                        {editingId === station.id ? 'إغلاق' : 'تعديل'}
                      </PillButton>
                    </td>
                  </tr>
                  {editingId === station.id && (
                    <tr className="border-b border-surface-alt bg-paper last:border-0">
                      <td colSpan={6} className="px-[18px] py-4">
                        <div className="flex flex-wrap items-end gap-3">
                          <div>
                            <label className="mb-1 block text-[11.5px] text-ink-soft">الاسم</label>
                            <input value={editName} onChange={(e) => setEditName(e.target.value)} className={`w-56 ${inputClass}`} />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11.5px] text-ink-soft">البلدية</label>
                            <input
                              value={editMunicipality}
                              onChange={(e) => setEditMunicipality(e.target.value)}
                              className={`w-40 ${inputClass}`}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11.5px] text-ink-soft">الحالة</label>
                            <select
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value as StationStatus)}
                              className={inputClass}
                            >
                              <option value="ACTIVE">ACTIVE</option>
                              <option value="INACTIVE">INACTIVE</option>
                              <option value="SUSPENDED">SUSPENDED</option>
                            </select>
                          </div>
                          <PillButton disabled={!editName || updateMutation.isPending} onClick={() => updateMutation.mutate(station.id)}>
                            حفظ
                          </PillButton>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
