import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { downloadCsv } from '../../lib/csv';
import { usePageParam } from '../../lib/usePageParam';
import { Pagination } from '../../components/Pagination';
import { useAuth } from '../auth/AuthProvider';
import { Card } from '../../components/design/Card';
import { Dialog } from '../../components/design/Dialog';
import { PillButton } from '../../components/design/PillButton';
import { StatusPill } from '../../components/design/StatusPill';
import { FieldLabel, TextAreaField, TextField } from '../../components/design/TextField';
import { Icon, ICONS } from '../../components/icons';
import { CsvButton, ErrorNote, Loading, PdfButton, RangeBar, SectionTitle, dayLabel, errorText, num, stamp, useRange } from './common';
const ENTRIES_PAGE_SIZE = 25;

import type { EntriesResponse, ReconciliationResponse, StockEntryRow, StockPool, StockWindow } from './types';

// Phase 4c, report 2: blank-card stock. Deliveries and physical counts are
// entered here and never edited (a mistake is fixed with a linked correction
// entry); the server compares the blanks used between two counts with the
// prints it recorded in the same window.

interface Office {
  id: string;
  name: string;
}
interface Desk {
  id: string;
  name: string;
}

const SELECT =
  'h-[52px] w-full rounded-sm border border-line bg-surface-alt px-3.5 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface lg:h-10 lg:text-[14px]';

const KIND_LABEL = { RECEIVED: 'دفعة مستلمة', COUNT: 'جرد' } as const;

// What a window's difference means, in words, with the number. Never colour alone.
function Verdict({ w }: { w: Pick<StockWindow, 'status' | 'difference'> }) {
  if (w.status === 'OK') {
    return (
      <StatusPill variant="ok" size="md">
        ✓ مطابق: لا فرق
      </StatusPill>
    );
  }
  if (w.status === 'UNACCOUNTED') {
    return (
      <StatusPill variant="danger" size="md">
        ✕ بطاقات غير مبرَّرة: {num(w.difference)}
      </StatusPill>
    );
  }
  return (
    <StatusPill variant="warn" size="md">
      ⚠ المطبوع أكثر من المستهلك بـ {num(-w.difference)}: غالبًا خطأ في العدّ
    </StatusPill>
  );
}

function poolTitle(p: StockPool): string {
  return p.desk ? `${p.registrationStation.name} — ${p.desk.name || 'شباك'}` : `${p.registrationStation.name} — المكتب كله`;
}

function windowText(w: StockWindow) {
  return `من ${stamp(w.from.at)} إلى ${stamp(w.to.at)}`;
}

// Phase 5B: no longer a page of its own. It lives in the «البطاقات والمخزون» tab
// of one office (`fixedOfficeId`), where the office is already chosen.
export function CardStockPanel({ fixedOfficeId }: { fixedOfficeId?: string }) {
  const { hasPermission } = useAuth();
  const canRecord = hasPermission('card_stock:record');
  const queryClient = useQueryClient();
  const [range, setRange] = useRange(30);
  const [officeId, setOfficeId] = useState(fixedOfficeId ?? '');
  const [form, setForm] = useState<null | 'RECEIVED' | 'COUNT'>(null);
  const [correcting, setCorrecting] = useState<StockEntryRow | null>(null);

  const officesQuery = useQuery({
    queryKey: ['registration-stations', 'for-stock'],
    queryFn: async () => (await apiClient.get<Office[]>('/registration-stations')).data,
    enabled: hasPermission('registration_stations:read') && !fixedOfficeId,
  });
  const params = { ...range, registrationStationId: officeId || undefined };
  const reconciliation = useQuery({
    queryKey: ['card-stock', 'reconciliation', params],
    queryFn: async () => (await apiClient.get<ReconciliationResponse>('/card-stock/reconciliation', { params })).data,
  });
  const entriesPage = usePageParam(ENTRIES_PAGE_SIZE);
  const entries = useQuery({
    queryKey: ['card-stock', 'entries', params, entriesPage.skip],
    placeholderData: (prev) => prev,
    queryFn: async () =>
      (await apiClient.get<EntriesResponse>('/card-stock/entries', { params: { ...params, skip: entriesPage.skip, take: ENTRIES_PAGE_SIZE } })).data,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['card-stock'] });

  const pools = reconciliation.data?.pools ?? [];
  const csvRows = pools.flatMap((p) =>
    p.windows.map((w) => [poolTitle(p), stamp(w.from.at), stamp(w.to.at), w.from.quantity, w.received, w.to.quantity, w.used, w.prints.card, w.prints.test, w.prints.total, w.difference, w.status === 'OK' ? 'مطابق' : w.status === 'UNACCOUNTED' ? 'بطاقات غير مبرَّرة' : 'احتمال خطأ في العدّ']),
  );
  // The CSV holds EVERY entry of the period, not just the page on screen: it is
  // read page by page when the button is pressed.
  async function allEntryRows(): Promise<Array<Array<string | number>>> {
    const rows: Array<Array<string | number>> = [];
    for (let skip = 0; skip < 5000; skip += 100) {
      const res = (await apiClient.get<EntriesResponse>('/card-stock/entries', { params: { ...params, skip, take: 100 } })).data;
      for (const e of res.entries) {
        rows.push([stamp(e.occurredAt), KIND_LABEL[e.kind], e.registrationStation.name, e.desk?.name ?? 'المكتب كله', e.quantity, e.corrected ? e.originalQuantity : '', e.createdBy.fullName, e.note ?? '']);
      }
      if (res.entries.length < 100 || skip + 100 >= (res.total ?? 0)) break;
    }
    return rows;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[16px] text-ink-soft lg:text-[14px]">ما وصل وما عُدّ وما طُبع، وأي نقص غير مبرَّر</p>
        {canRecord && (
          <div className="flex flex-wrap gap-2.5">
            <PillButton size="field" onClick={() => setForm('RECEIVED')}>تسجيل دفعة مستلمة</PillButton>
            <PillButton size="field" variant="secondary" onClick={() => setForm('COUNT')}>تسجيل جرد</PillButton>
          </div>
        )}
      </div>
      <RangeBar
        range={range}
        onChange={setRange}
        extra={
          !fixedOfficeId && (officesQuery.data?.length ?? 0) > 1 ? (
            <div className="col-span-2 lg:col-span-1">
              <FieldLabel htmlFor="stock-office">المكتب</FieldLabel>
              <select id="stock-office" className={SELECT} value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
                <option value="">كل المكاتب</option>
                {officesQuery.data!.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          ) : undefined
        }
      />

      <Card className="mb-5 p-4">
        <h2 className="text-[16px] font-extrabold text-ink lg:text-[14px]">كيف يُحسب الفرق</h2>
        <p className="mt-1 text-[16px] text-ink-soft lg:text-[14px]">
          المستهلك = الجرد السابق + ما استُلم − الجرد الحالي. نقارنه بالبطاقات التي طبعها النظام في الفترة نفسها، وتشمل البطاقات التي فشلت طباعتها وبطاقات الاختبار، لأن كل طباعة تستهلك بطاقة فارغة. الفرق صفر يعني أن كل بطاقة معروفة المصير.
        </p>
      </Card>

      {reconciliation.isLoading && <Loading />}
      {reconciliation.isError && <ErrorNote error={reconciliation.error} />}
      {reconciliation.data && pools.length === 0 && (
        <p className="rounded-md bg-surface p-4 text-[16px] text-ink-soft lg:text-[14px]">لا توجد مكاتب تسجيل ضمن نطاقك.</p>
      )}

      <div className="space-y-4">
        {pools.map((p) => (
          <Card key={`${p.registrationStation.id}-${p.desk?.id ?? 'office'}`} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-[18px] font-extrabold text-ink lg:text-[15px]">{poolTitle(p)}</h2>
              {p.totals.unaccountedCards > 0 ? (
                <StatusPill variant="danger" size="md">✕ بطاقات غير مبرَّرة في الفترة: {num(p.totals.unaccountedCards)}</StatusPill>
              ) : p.windows.length > 0 && p.totals.negativeWindows === 0 ? (
                <StatusPill variant="ok" size="md">✓ لا بطاقات غير مبرَّرة</StatusPill>
              ) : null}
            </div>

            {p.entryCount === 0 && (
              <p className="mt-2 text-[16px] text-ink-soft lg:text-[14px]">لم يُسجَّل أي استلام أو جرد لهذا المكتب بعد.</p>
            )}
            {p.entryCount > 0 && p.windows.length === 0 && (
              <p className="mt-2 text-[16px] text-ink-soft lg:text-[14px]">لا توجد فترة جرد مغلقة ضمن التواريخ المختارة. تُحسب المقارنة بين جردين متتاليين.</p>
            )}

            <ul className="mt-3 space-y-3">
              {p.windows.map((w) => (
                <li key={`${w.from.id}-${w.to.id}`} className="rounded-sm bg-surface-alt p-3">
                  <p className="text-[14px] text-ink-soft lg:text-[12px]">{windowText(w)}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[16px] lg:grid-cols-5 lg:text-[14px]">
                    {[
                      ['الجرد السابق', w.from.quantity],
                      ['ما استُلم', w.received],
                      ['الجرد الحالي', w.to.quantity],
                      ['المستهلك', w.used],
                      ['المطبوع في النظام', w.prints.total],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <dt className="text-ink-soft">{label}</dt>
                        <dd className="font-extrabold text-ink">{num(value as number)}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-1 text-[14px] text-ink-soft lg:text-[12px]">
                    منها بطاقات: {num(w.prints.card)} — بطاقات اختبار: {num(w.prints.test)}
                    {(w.from.corrected || w.to.corrected) && ' — أحد الجردين مصحَّح'}
                  </p>
                  <div className="mt-2">
                    <Verdict w={w} />
                  </div>
                </li>
              ))}
            </ul>

            {p.sinceLastCount && (
              <p className="mt-3 text-[16px] text-ink-soft lg:text-[14px]">
                منذ آخر جرد ({stamp(p.sinceLastCount.lastCount.at)}): استُلم {num(p.sinceLastCount.receivedSince)}، طُبع {num(p.sinceLastCount.prints.total)}.
                المتوقع أن يتبقى <strong className="text-ink">{num(p.sinceLastCount.expectedRemaining)}</strong> بطاقة فارغة.
              </p>
            )}
          </Card>
        ))}
      </div>
      {pools.length > 0 && (
        <p className="mt-3 text-[14px] text-ink-soft lg:text-[12px]">
          يُحسب مخزون المكتب كله ومخزون كل شباك على حدة ولا يُجمعان معًا.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <CsvButton
          filename={`card-stock-reconciliation_${range.from}_${range.to}.csv`}
          headers={['المخزون', 'من', 'إلى', 'الجرد السابق', 'ما استُلم', 'الجرد الحالي', 'المستهلك', 'مطبوع (بطاقات)', 'مطبوع (اختبار)', 'مطبوع (المجموع)', 'الفرق', 'الحالة']}
          rows={csvRows}
          label="تنزيل المقارنة CSV"
        />
        <PdfButton path="/card-stock/reconciliation/export" params={params} filename={`card-stock_${range.from}_${range.to}.pdf`} />
      </div>

      <SectionTitle>سجل الاستلام والجرد</SectionTitle>
      {entries.isLoading && <Loading />}
      {entries.isError && <ErrorNote error={entries.error} />}
      {entries.data && entries.data.entries.length === 0 && (
        <p className="rounded-md bg-surface p-4 text-[16px] text-ink-soft lg:text-[14px]">لا توجد سجلات في هذه الفترة.</p>
      )}
      {entries.data && entries.data.entries.length > 0 && (
        <>
          <Card>
            <ul>
              {entries.data.entries.map((e) => (
                <li key={e.id} className="border-b border-surface-alt px-4 py-3 last:border-b-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-[16px] font-extrabold text-ink lg:text-[14px]">
                      {KIND_LABEL[e.kind]}: {num(e.quantity)}
                      {e.corrected && <span className="ms-2 text-[14px] font-normal text-ink-soft lg:text-[12px]">(مصحَّح، الأصل {num(e.originalQuantity)})</span>}
                    </span>
                    <time dateTime={e.occurredAt} dir="ltr" className="text-[14px] text-ink-soft lg:text-[12px]">{stamp(e.occurredAt)}</time>
                  </div>
                  <p className="text-[14px] text-ink-soft lg:text-[12px]">
                    {e.registrationStation.name} — {e.desk?.name ?? 'المكتب كله'} — سجّله {e.createdBy.fullName}
                    {e.note && ` — ${e.note}`}
                  </p>
                  {e.corrections.map((c) => (
                    <p key={c.id} className="mt-1 text-[14px] text-ink-soft lg:text-[12px]">
                      تصحيح إلى {num(c.quantity)} بتاريخ {stamp(c.createdAt)} ({c.createdBy.fullName}): {c.reason}
                    </p>
                  ))}
                  {canRecord && (
                    <PillButton size="field" variant="ghost" className="mt-1" onClick={() => setCorrecting(e)}>
                      تصحيح الرقم
                    </PillButton>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <div className="mt-3">
            <PillButton
              size="field"
              variant="secondary"
              onClick={async () =>
                downloadCsv(
                  `card-stock-entries_${range.from}_${range.to}.csv`,
                  ['الوقت', 'النوع', 'المكتب', 'الشباك', 'الكمية', 'الكمية الأصلية (إن صُحّحت)', 'سجّله', 'ملاحظة'],
                  await allEntryRows(),
                )
              }
            >
              تنزيل السجل CSV
            </PillButton>
            <Pagination
              skip={entriesPage.skip}
              take={ENTRIES_PAGE_SIZE}
              total={entries.data.total ?? entries.data.entries.length}
              onSkipChange={entriesPage.setSkip}
              testId="card-stock-pager"
            />
          </div>
        </>
      )}

      {form && (
        <EntryDialog
          kind={form}
          offices={officesQuery.data ?? []}
          defaultOffice={officeId}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refresh();
          }}
        />
      )}
      {correcting && (
        <CorrectionDialog
          entry={correcting}
          onClose={() => setCorrecting(null)}
          onSaved={() => {
            setCorrecting(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function EntryDialog({
  kind,
  offices,
  defaultOffice,
  onClose,
  onSaved,
}: {
  kind: 'RECEIVED' | 'COUNT';
  offices: Office[];
  defaultOffice: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [officeId, setOfficeId] = useState(defaultOffice || offices[0]?.id || '');
  const [deskId, setDeskId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [when, setWhen] = useState(localNow());
  const [note, setNote] = useState('');
  const desks = useQuery({
    queryKey: ['registration-desks', officeId],
    queryFn: async () => (await apiClient.get<Desk[]>(`/registration-stations/${officeId}/desks`)).data,
    enabled: Boolean(officeId),
  });
  const save = useMutation({
    mutationFn: () =>
      apiClient.post('/card-stock/entries', {
        registrationStationId: officeId,
        deskId: deskId || undefined,
        kind,
        quantity: Number(quantity),
        occurredAt: when ? new Date(when).toISOString() : undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: onSaved,
  });
  const quantityOk = /^\d+$/.test(quantity);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (quantityOk && officeId) save.mutate();
  }

  return (
    <Dialog
      open
      title={kind === 'RECEIVED' ? 'تسجيل دفعة بطاقات مستلمة' : 'تسجيل جرد البطاقات الفارغة'}
      onClose={onClose}
      busy={save.isPending}
      footer={
        <>
          <PillButton size="field" variant="secondary" onClick={onClose} disabled={save.isPending}>إلغاء</PillButton>
          <PillButton size="field" type="submit" form="stock-entry-form" disabled={!quantityOk || !officeId || save.isPending}>
            {save.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
          </PillButton>
        </>
      }
    >
      <form id="stock-entry-form" onSubmit={submit} className="space-y-4">
        <p className="text-[16px] text-ink-soft lg:text-[14px]">
          لا يمكن تعديل السجل بعد حفظه. إن أخطأت فاستعمل «تصحيح الرقم» لاحقًا، فيبقى الأصل والتصحيح ظاهرين.
        </p>
        <div>
          <FieldLabel htmlFor="entry-office">مكتب التسجيل</FieldLabel>
          <select id="entry-office" className={SELECT} value={officeId} onChange={(e) => { setOfficeId(e.target.value); setDeskId(''); }}>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="entry-desk">الشباك</FieldLabel>
          <select id="entry-desk" className={SELECT} value={deskId} onChange={(e) => setDeskId(e.target.value)}>
            <option value="">المكتب كله</option>
            {(desks.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <TextField
          label={kind === 'RECEIVED' ? 'عدد البطاقات المستلمة' : 'عدد البطاقات الفارغة التي عددتها الآن'}
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
          error={quantity && !quantityOk ? 'اكتب رقمًا صحيحًا' : null}
          ltr
        />
        <TextField label={kind === 'RECEIVED' ? 'وقت الاستلام' : 'وقت الجرد'} type="datetime-local" value={when} max={localNow()} onChange={(e) => setWhen(e.target.value)} ltr />
        <TextAreaField label="ملاحظة (اختياري)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        {save.isError && <ErrorNote error={save.error} />}
      </form>
    </Dialog>
  );
}

function CorrectionDialog({ entry, onClose, onSaved }: { entry: StockEntryRow; onClose: () => void; onSaved: () => void }) {
  const [quantity, setQuantity] = useState(String(entry.quantity));
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => apiClient.post(`/card-stock/entries/${entry.id}/corrections`, { quantity: Number(quantity), reason: reason.trim() }),
    onSuccess: onSaved,
  });
  const ok = /^\d+$/.test(quantity) && reason.trim().length >= 3;
  return (
    <Dialog
      open
      title={`تصحيح ${KIND_LABEL[entry.kind]} بتاريخ ${dayLabel(entry.occurredAt.slice(0, 10))}`}
      onClose={onClose}
      busy={save.isPending}
      footer={
        <>
          <PillButton size="field" variant="secondary" onClick={onClose} disabled={save.isPending}>إلغاء</PillButton>
          <PillButton size="field" type="submit" form="stock-correct-form" disabled={!ok || save.isPending}>
            {save.isPending ? 'جارٍ الحفظ…' : 'حفظ التصحيح'}
          </PillButton>
        </>
      }
    >
      <form id="stock-correct-form" onSubmit={(e) => { e.preventDefault(); if (ok) save.mutate(); }} className="space-y-4">
        <p className="flex items-start gap-2 text-[16px] text-ink-soft lg:text-[14px]">
          <span className="mt-1 shrink-0"><Icon d={ICONS.lock} size={16} /></span>
          <span>الرقم الحالي {num(entry.quantity)}. لا يُمحى الأصل: يُضاف سجل تصحيح مرتبط به وفيه السبب، ويُحسب الرقم الجديد.</span>
        </p>
        <TextField label="الرقم الصحيح" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))} ltr />
        <TextAreaField label="سبب التصحيح" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} hint="مطلوب، ثلاثة أحرف على الأقل." />
        {save.isError && <p role="alert" className="text-[16px] font-bold text-danger-dark lg:text-[14px]">{errorText(save.error)}</p>}
      </form>
    </Dialog>
  );
}
