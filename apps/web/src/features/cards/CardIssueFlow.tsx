import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PillButton } from '../../components/design/PillButton';
import { LtrText } from '../../components/LtrText';
import {
  cardErrorMessage,
  printCardPdf,
  printPdfBlob,
  printerSetupPdf,
  rememberDesk,
  rememberedDeskId,
  rememberPrintMode,
  rememberedPrintMode,
  type IssuableReason,
  type RegistrationDeskRow,
  type VehicleCardRow,
} from './cardApi';

type Step = 'ready' | 'issued' | 'confirm' | 'done';

// On-screen preview of the card (one face), rendered by the same template the PDF
// uses (GET /cards/:id/preview). Viewing isn't printing — not audited.
function CardPreview({ cardId }: { cardId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    apiClient
      .get<Blob>(`/cards/${cardId}/preview`, { responseType: 'blob' })
      .then((res) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(res.data);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [cardId]);
  return (
    <div className="flex aspect-[85.6/53.98] w-[340px] max-w-full items-center justify-center overflow-hidden rounded-[12px] bg-surface-alt shadow-md">
      {url ? (
        <img src={url} alt="معاينة البطاقة" className="h-full w-full object-contain" data-testid="card-preview-image" />
      ) : (
        <span className="text-[13px] lg:text-[12px] text-ink-faint">...جارٍ تجهيز المعاينة</span>
      )}
    </div>
  );
}

// Registration pivot, phase 3 — issuing and printing at the desk:
//  1. the desk (picked once per device, remembered on it);
//  2. «إصدار البطاقة» creates the card and shows a preview;
//  3. «طباعة» sends the card PDF to the printer;
//  4. «هل طُبعت البطاقة بشكل سليم؟» — no: that card is cancelled on the spot
//     (failed print) and a new card number is issued and printed.
// Every issue, print and cancellation is audited server-side.
export function CardIssueFlow({
  vehicleId,
  registrationStationId,
  reason,
  reasonNote,
  onDone,
  onCancel,
}: {
  vehicleId: string;
  registrationStationId: string;
  reason: IssuableReason;
  reasonNote?: string;
  onDone?: (card: VehicleCardRow) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [deskId, setDeskId] = useState<string | null>(() => rememberedDeskId(registrationStationId));
  const [choosingDesk, setChoosingDesk] = useState(false);
  const [card, setCard] = useState<VehicleCardRow | null>(null);
  const [step, setStep] = useState<Step>('ready');
  const [error, setError] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<'full' | 'black'>(() => rememberedPrintMode());

  const desksQuery = useQuery({
    queryKey: ['registration-desks', registrationStationId],
    queryFn: async () =>
      (await apiClient.get<RegistrationDeskRow[]>(`/registration-stations/${registrationStationId}/desks`)).data,
  });
  const activeDesks = (desksQuery.data ?? []).filter((d) => d.isActive);
  const desk = activeDesks.find((d) => d.id === deskId) ?? null;
  const needsDeskChoice = !desk || choosingDesk;

  const invalidateCards = () => queryClient.invalidateQueries({ queryKey: ['vehicle-cards', vehicleId] });

  async function print(target: VehicleCardRow) {
    setError(null);
    try {
      setFallbackUrl(printPdfBlob(await printCardPdf(target.id, printMode, { registrationStationId, deskId: deskId ?? undefined })));
      setStep('confirm');
    } catch (err) {
      setError(cardErrorMessage(err, 'تعذرت الطباعة. حاول مرة أخرى.'));
    }
  }

  const issue = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post<VehicleCardRow>(`/vehicles/${vehicleId}/cards`, {
          registrationStationId,
          deskId,
          reason,
          reasonNote: reasonNote?.trim() || undefined,
        })
      ).data,
    onSuccess: (created) => {
      setCard(created);
      setStep('issued');
      invalidateCards();
    },
    onError: (err) => setError(cardErrorMessage(err)),
  });

  const failedPrint = useMutation({
    mutationFn: async (target: VehicleCardRow) =>
      (await apiClient.post<VehicleCardRow>(`/cards/${target.id}/failed-print`, { registrationStationId, deskId })).data,
    onSuccess: async (replacement) => {
      setCard(replacement);
      invalidateCards();
      await print(replacement);
    },
    onError: (err) => setError(cardErrorMessage(err)),
  });

  async function printSetupCard() {
    setError(null);
    try {
      setFallbackUrl(printPdfBlob(await printerSetupPdf()));
    } catch (err) {
      setError(cardErrorMessage(err, 'تعذّر تجهيز بطاقة إعداد الطابعة.'));
    }
  }

  return (
    <div className="space-y-3" data-testid="card-issue-flow">
      {/* Desk (per device) */}
      <div className="rounded-sm bg-surface-alt p-3">
        {desksQuery.isLoading ? (
          <p className="text-[13px] lg:text-[12px] text-ink-soft">...جارٍ تحميل المكاتب</p>
        ) : activeDesks.length === 0 ? (
          <p className="text-[13px] lg:text-[12px] text-danger">لا توجد مكاتب طباعة مفعّلة في مكتب التسجيل هذا — راجع مسؤول المنظومة.</p>
        ) : needsDeskChoice ? (
          <div>
            <label className="mb-1 block text-[13px] lg:text-[12px] font-bold text-ink-soft">المكتب الذي تطبع منه (يُحفظ على هذا الجهاز)</label>
            <select
              data-testid="card-desk-select"
              value={desk?.id ?? ''}
              onChange={(e) => {
                setDeskId(e.target.value);
                rememberDesk(registrationStationId, e.target.value);
                setChoosingDesk(false);
              }}
              className="h-9 w-full rounded-sm bg-surface px-3 text-[13px] lg:text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent sm:w-72"
            >
              <option value="">اختر المكتب</option>
              {activeDesks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.printerModel ? ` — ${d.printerModel}` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] lg:text-[12px]">
            <span>
              المكتب: <span className="font-bold text-ink" data-testid="card-desk-current">{desk.name}</span>
              {desk.printerModel && <span className="text-ink-faint"> — {desk.printerModel}</span>}
            </span>
            <span className="flex gap-3">
              <button type="button" className="font-bold text-accent-ink" onClick={() => setChoosingDesk(true)}>
                تغيير المكتب
              </button>
              <button type="button" className="font-bold text-ink-soft" onClick={printSetupCard} data-testid="card-print-setup">
                بطاقة إعداد الطابعة
              </button>
            </span>
            <label className="flex w-full items-center gap-1.5 text-[13px] lg:text-[12px] text-ink-soft">
              <input
                type="checkbox"
                checked={printMode === 'black'}
                data-testid="card-print-black-only"
                onChange={(e) => {
                  const mode = e.target.checked ? 'black' : 'full';
                  setPrintMode(mode);
                  rememberPrintMode(mode);
                }}
              />
              شريط أحادي اللون — اطبع بالأسود فقط (يُحفظ على هذا الجهاز)
            </label>
          </div>
        )}
      </div>

      {step === 'ready' && (
        <div className="flex flex-wrap gap-2">
          <PillButton
            data-testid="card-issue"
            disabled={!desk || needsDeskChoice || issue.isPending}
            onClick={() => {
              setError(null);
              issue.mutate();
            }}
          >
            {issue.isPending ? '...جارٍ الإصدار' : 'إصدار البطاقة'}
          </PillButton>
          {onCancel && (
            <PillButton variant="ghost" onClick={onCancel}>
              إلغاء
            </PillButton>
          )}
        </div>
      )}

      {card && step !== 'ready' && (
        <div className="flex flex-wrap items-start gap-4">
          <CardPreview cardId={card.id} />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-[13px] lg:text-[12px] text-ink-faint">رقم البطاقة</p>
              <p className="text-[20px] font-black text-primary" data-testid="card-issued-number">
                <LtrText>{card.cardNumber}</LtrText>
              </p>
            </div>

            {step === 'issued' && (
              <>
                <PillButton data-testid="card-print" onClick={() => print(card)}>
                  طباعة
                </PillButton>
                <p className="max-w-md text-[14px] leading-[1.8] text-ink-soft lg:text-[12px]" data-testid="card-print-instructions">
                  عند ظهور نافذة الطباعة: اختر طابعة البطاقات، والحجم «CR80»، والاتجاه أفقي، والمقياس «100%» (حجم فعلي)، واترك الهوامش «بلا». ضع بطاقة بيضاء واحدة في الطابعة قبل الضغط.
                </p>
              </>
            )}

            {step === 'confirm' && (
              <div className="rounded-sm border border-line p-3" data-testid="card-print-confirm">
                <p className="text-[15px] lg:text-[13px] font-bold text-ink">هل طُبعت البطاقة بشكل سليم؟</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <PillButton
                    size="sm"
                    data-testid="card-print-ok"
                    onClick={() => {
                      setStep('done');
                      onDone?.(card);
                    }}
                  >
                    نعم
                  </PillButton>
                  <PillButton
                    size="sm"
                    variant="danger"
                    data-testid="card-print-failed"
                    disabled={failedPrint.isPending}
                    onClick={() => {
                      setError(null);
                      failedPrint.mutate(card);
                    }}
                  >
                    {failedPrint.isPending ? '...جارٍ إصدار بطاقة جديدة' : 'لا — إلغاؤها وطباعة بطاقة جديدة'}
                  </PillButton>
                </div>
                <p className="mt-2 text-[13px] lg:text-[12px] text-ink-faint">
                  «لا» تُلغي هذه البطاقة فورًا فلا تعمل في أي محطة، وتُصدر رقمًا جديدًا يُطبع مباشرة.
                </p>
                {fallbackUrl && (
                  <a href={fallbackUrl} target="_blank" rel="noopener" className="mt-1 block text-[13px] lg:text-[12px] font-bold text-accent-ink">
                    لم تظهر نافذة الطباعة؟ افتح ملف البطاقة
                  </a>
                )}
              </div>
            )}

            {step === 'done' && (
              <p className="text-[15px] lg:text-[13px] font-bold text-ok" data-testid="card-done">
                تم إصدار البطاقة وطباعتها.
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="text-[13px] lg:text-[12px] text-danger" data-testid="card-error">
          {error}
        </p>
      )}
    </div>
  );
}
