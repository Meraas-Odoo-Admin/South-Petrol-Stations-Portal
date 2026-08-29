import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ReportExportFormat,
  ViolationStatus,
  ViolationsResponse,
} from '@fuel-tracking/shared-types';
import { apiClient } from '../../lib/apiClient';
import { downloadBlob } from '../../lib/download';
import { useAuth } from '../auth/AuthProvider';
import { maskIdentityNumber } from '../../lib/masking';
import { formatLicensePlate } from '../../lib/libyanFormats';
import { Pagination } from '../../components/Pagination';
import { StationSelect } from '../../components/StationSelect';
import { LtrText } from '../../components/LtrText';
import { PageHeader } from '../../components/design/PageHeader';
import { Card } from '../../components/design/Card';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { CodeText } from '../../components/design/CodeText';
import { TriggerDetail } from '../fillups/RecordFillUpPage';
import { RULE_VIOLATION_MESSAGES } from '../fillups/ruleViolationMessages';
import type { RuleFailureReason } from '@fuel-tracking/shared-types';

const TAKE = 20;

const selectClass =
  'h-9 rounded-sm bg-surface-alt px-3 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60';

export function ViolationsPage() {
  const { user, hasPermission } = useAuth();
  const canViewAllStations = hasPermission('reports:view_all_stations');
  const canApprove = hasPermission('fillups:approve_exception');
  const ownStation = user?.stationScope[0] ?? null;
  const permissions = user?.permissions ?? [];
  const queryClient = useQueryClient();

  const [stationId, setStationId] = useState(canViewAllStations ? '' : (ownStation?.stationId ?? ''));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<ViolationStatus>('all');
  const [skip, setSkip] = useState(0);
  const [exporting, setExporting] = useState<ReportExportFormat | null>(null);

  const exportParams = {
    stationId: stationId || undefined,
    from: from ? `${from}T00:00:00.000Z` : undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
    status,
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', 'violations', stationId, from, to, status, skip],
    queryFn: async () =>
      (
        await apiClient.get<ViolationsResponse>('/reports/violations', {
          params: { ...exportParams, skip, take: TAKE },
        })
      ).data,
  });

  async function handleExport(format: ReportExportFormat) {
    setExporting(format);
    try {
      const res = await apiClient.get('/reports/violations/export', {
        params: { ...exportParams, format },
        responseType: 'blob',
      });
      downloadBlob(res.data, `violations.${format}`);
    } finally {
      setExporting(null);
    }
  }

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setSkip(0);
    };
  }

  const approveMutation = useMutation({
    mutationFn: (fillUpTransactionId: string) =>
      apiClient.post(`/fillups/${fillUpTransactionId}/exceptions/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'violations'] });
    },
  });

  return (
    <div>
      <PageHeader
        title="المخالفات / الاستثناءات"
        actions={
          <>
            <PillButton variant="secondary" size="sm" onClick={() => handleExport('xlsx')} disabled={exporting !== null}>
              {exporting === 'xlsx' ? '...' : 'تصدير Excel'}
            </PillButton>
            <PillButton size="sm" onClick={() => handleExport('pdf')} disabled={exporting !== null}>
              {exporting === 'pdf' ? '...' : 'تصدير PDF'}
            </PillButton>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-ink-soft">المحطة</label>
            {canViewAllStations ? (
              <StationSelect value={stationId} onChange={resetPageAnd(setStationId)} allowAllOption className={`w-52 ${selectClass}`} />
            ) : (
              <StationSelect value={stationId} onChange={resetPageAnd(setStationId)} disabled className={`w-52 ${selectClass}`} />
            )}
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-ink-soft">من تاريخ</label>
            <input type="date" value={from} onChange={(e) => resetPageAnd(setFrom)(e.target.value)} className={selectClass} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-ink-soft">إلى تاريخ</label>
            <input type="date" value={to} onChange={(e) => resetPageAnd(setTo)(e.target.value)} className={selectClass} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-ink-soft">الحالة</label>
            <select
              value={status}
              onChange={(e) => resetPageAnd(setStatus)(e.target.value as ViolationStatus)}
              className={selectClass}
            >
              <option value="all">الكل</option>
              <option value="pending">قيد الانتظار</option>
              <option value="approved">معتمدة</option>
            </select>
          </div>
        </div>
      </Card>

      {isLoading && <p className="text-[13px] text-ink-soft">...جارٍ التحميل</p>}
      {isError && <p className="text-[13px] text-danger">تعذر تحميل المخالفات.</p>}
      {approveMutation.isError && <p className="mb-2 text-[13px] text-danger">تعذر اعتماد الاستثناء.</p>}

      {data && (
        <>
          {/* Mobile: tap-to-approve card list (8b) rather than a table with a hidden approve column */}
          <div className="flex flex-col gap-2.5 sm:hidden">
            {data.rows.map((row) => (
              <Card key={row.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-extrabold text-ink">{row.fillUpTransaction.driver.fullName}</p>
                    <p className="mt-0.5 text-[11.5px] text-ink-soft">
                      <LtrText>{formatLicensePlate(row.fillUpTransaction.vehicle.currentPlate)}</LtrText>
                      {' — '}
                      {row.fillUpTransaction.station.internalCode}
                    </p>
                  </div>
                  <StatusPill variant={row.approvedById ? 'ok' : 'accent'}>
                    {row.approvedById ? 'معتمدة' : 'قيد الانتظار'}
                  </StatusPill>
                </div>

                <p className="mt-2 text-[11px] text-ink-faint">
                  <CodeText>{new Date(row.fillUpTransaction.occurredAt).toLocaleString('en-GB')}</CodeText>
                  {' · '}
                  {row.exceptionType.name}
                </p>

                {row.triggerReason ? (
                  <div className="mt-2 rounded-sm bg-surface-alt px-3 py-2">
                    <p className="text-[12px] text-ink">
                      {RULE_VIOLATION_MESSAGES[row.triggerReason as RuleFailureReason] ?? row.triggerReason}
                    </p>
                    <TriggerDetail trigger={row.triggerDetail} />
                  </div>
                ) : null}

                {canApprove && !row.approvedById && (
                  // Distinct from the desktop table's copy below — both
                  // render simultaneously in the DOM (one hidden via CSS
                  // per viewport), so a shared testid queried without
                  // scoping to a specific row/table would match both.
                  <PillButton
                    data-testid="approve-exception-button-mobile"
                    size="sm"
                    onClick={() => approveMutation.mutate(row.fillUpTransactionId)}
                    disabled={approveMutation.isPending}
                    className="mt-3 w-full !border-0 !bg-ok !text-white !shadow-none"
                  >
                    اعتماد
                  </PillButton>
                )}
              </Card>
            ))}
            {data.rows.length === 0 && (
              <Card className="p-6 text-center text-[13px] text-ink-soft">لا توجد مخالفات مطابقة</Card>
            )}
            <Pagination skip={skip} take={TAKE} total={data.total} onSkipChange={setSkip} />
          </div>

          {/* Desktop table (8b) */}
          <Card className="hidden sm:block">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-[12.5px]">
            <thead>
              <tr className="bg-surface-alt text-[11px] font-bold text-ink-soft">
                <th className="px-[18px] py-2.5 text-start">التاريخ</th>
                <th className="px-[18px] py-2.5 text-start">المحطة</th>
                <th className="px-[18px] py-2.5 text-start">المركبة</th>
                <th className="px-[18px] py-2.5 text-start">السائق</th>
                <th className="px-[18px] py-2.5 text-start">رقم الهوية</th>
                <th className="px-[18px] py-2.5 text-start">نوع الاستثناء</th>
                <th className="px-[18px] py-2.5 text-start">سبب المخالفة (تشخيص النظام)</th>
                <th className="px-[18px] py-2.5 text-start">الحالة</th>
                {canApprove && <th className="px-[18px] py-2.5 text-start"></th>}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-b border-surface-alt align-top last:border-0">
                  <td className="px-[18px] py-3">
                    <CodeText>{new Date(row.fillUpTransaction.occurredAt).toLocaleString('en-GB')}</CodeText>
                  </td>
                  <td className="px-[18px] py-3">{row.fillUpTransaction.station.internalCode}</td>
                  <td className="px-[18px] py-3">
                    <LtrText>{formatLicensePlate(row.fillUpTransaction.vehicle.currentPlate)}</LtrText>
                  </td>
                  <td className="px-[18px] py-3 font-medium text-ink">{row.fillUpTransaction.driver.fullName}</td>
                  <td className="px-[18px] py-3">
                    <LtrText>{maskIdentityNumber(row.fillUpTransaction.driver.identityNumber, permissions)}</LtrText>
                  </td>
                  <td className="px-[18px] py-3">{row.exceptionType.name}</td>
                  <td className="px-[18px] py-3">
                    {row.triggerReason ? (
                      <>
                        <p className="text-ink">{RULE_VIOLATION_MESSAGES[row.triggerReason as RuleFailureReason] ?? row.triggerReason}</p>
                        <TriggerDetail trigger={row.triggerDetail} />
                      </>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-[18px] py-3">
                    <StatusPill variant={row.approvedById ? 'ok' : 'accent'}>
                      {row.approvedById ? 'معتمدة' : 'قيد الانتظار'}
                    </StatusPill>
                  </td>
                  {canApprove && (
                    <td className="px-[18px] py-3">
                      {!row.approvedById && (
                        <PillButton
                          data-testid="approve-exception-button-desktop"
                          size="sm"
                          onClick={() => approveMutation.mutate(row.fillUpTransactionId)}
                          disabled={approveMutation.isPending}
                          className="!bg-ok !text-white !border-0 !shadow-none"
                        >
                          اعتماد
                        </PillButton>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={canApprove ? 9 : 8} className="p-4 text-center text-[13px] text-ink-soft">
                    لا توجد مخالفات مطابقة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          <div className="px-[18px] py-3">
            <Pagination skip={skip} take={TAKE} total={data.total} onSkipChange={setSkip} />
          </div>
          </Card>
        </>
      )}
    </div>
  );
}
