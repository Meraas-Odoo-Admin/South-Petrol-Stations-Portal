import { isAxiosError } from 'axios';
import { describeApiError } from '../../lib/apiError';
import { apiClient } from '../../lib/apiClient';

// Registration pivot, phase 3 — the printed vehicle card.

export type CardStatus = 'ACTIVE' | 'REPLACED' | 'CANCELLED';
export type CardIssueReason = 'FIRST_ISSUE' | 'LOST' | 'DAMAGED' | 'FAILED_PRINT' | 'DETAILS_CHANGED';
export type IssuableReason = Exclude<CardIssueReason, 'FAILED_PRINT'>;

export interface VehicleCardRow {
  id: string;
  cardNumber: string;
  vehicleId: string;
  status: CardStatus;
  reason: CardIssueReason;
  reasonNote: string | null;
  issuedAt: string;
  replacedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  printedPlate: string;
  printedVehicleLine: string;
  printedIssueDate: string;
  printedStationCode: string;
  needsReissue: boolean;
  registrationStation: { id: string; internalCode: string; name: string };
  issuedBy: { id: string; fullName: string };
  cancelledBy: { id: string; fullName: string } | null;
}

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  ACTIVE: 'سارية',
  REPLACED: 'مستبدلة',
  CANCELLED: 'ملغاة',
};

export const CARD_REASON_LABELS: Record<CardIssueReason, string> = {
  FIRST_ISSUE: 'أول بطاقة',
  LOST: 'بدل فاقد',
  DAMAGED: 'بدل تالف',
  FAILED_PRINT: 'إعادة إصدار بعد فشل الطباعة',
  DETAILS_CHANGED: 'تغيّرت البيانات المطبوعة',
};

// The API refuses with machine-checkable codes; the Arabic lives here.
const CARD_ERRORS: Record<string, string> = {
  FIRST_ISSUE_NOT_ALLOWED: 'لهذه المركبة بطاقة سابقة — اختر سبب الإصدار (بدل فاقد، بدل تالف، أو تغيّر البيانات).',
  NO_CARD_TO_REPLACE: 'لا توجد بطاقة سابقة لهذه المركبة لاستبدالها — أصدر أول بطاقة.',
  MUNICIPALITY_HAS_NO_CODE: 'لم يُحدَّد رمز البلدية بعد، ولا يمكن إصدار بطاقات فيها — راجع مسؤول المنظومة.',
  MUNICIPALITY_HAS_NO_AUTHORITY: 'لا توجد جهة أمنية لهذه البلدية، ولا يمكن إصدار بطاقات فيها.',
  CARD_NOT_ACTIVE: 'هذه البطاقة لم تعد سارية.',
  CARD_ISSUE_CONFLICT: 'أُصدرت بطاقة لهذه المركبة للتو من مكان آخر — حدّث الصفحة.',
  REGISTRATION_STATION_NOT_ACTIVE: 'مكتب التسجيل هذا مغلق حاليًا.',
  MUNICIPALITY_NOT_LIVE: 'بلدية مكتب التسجيل هذا لم تُفعَّل بعد.',
};

export function cardErrorMessage(error: unknown, fallback = 'تعذر إتمام العملية.'): string {
  if (!isAxiosError<{ message?: unknown }>(error) || !error.response) return describeApiError(error, fallback).message;
  const code = error.response.data?.message;
  if (typeof code === 'string' && CARD_ERRORS[code]) return CARD_ERRORS[code];
  if (error.response.status === 403) return 'لا تملك صلاحية إصدار البطاقات أو طباعتها في مكتب التسجيل هذا.';
  return describeApiError(error, fallback).message;
}

// Print mode, per DEVICE (the printer next to it is loaded with one kind of
// ribbon) — Phase 7: the one printer setting left now desks are gone:
// 'full' prints colour + black (YMCKO ribbon); 'black' prints the same card
// in black only, for a monochrome ribbon.
export function rememberedPrintMode(): 'full' | 'black' {
  try {
    return localStorage.getItem('fuel.cardPrintMode') === 'black' ? 'black' : 'full';
  } catch {
    return 'full';
  }
}

export function rememberPrintMode(mode: 'full' | 'black'): void {
  try {
    localStorage.setItem('fuel.cardPrintMode', mode);
  } catch {
    // storage blocked — falls back to 'full' next time
  }
}

export async function fetchPdf(request: () => Promise<{ data: Blob }>): Promise<Blob> {
  return (await request()).data;
}

// `where` is the office the employee prints at. A card first issued at another
// office is reprinted from here: the print is counted at this office.
export function printCardPdf(
  cardId: string,
  mode: 'full' | 'black' = 'full',
  where: { registrationStationId?: string } = {},
): Promise<Blob> {
  return fetchPdf(() => apiClient.post<Blob>(`/cards/${cardId}/print`, { mode, ...where }, { responseType: 'blob' }));
}

// The printer setup card: one page of lines, a centre cross, a font ladder and
// QR codes at three sizes, to check the printer's alignment and QR scanning
// before a batch. Not a card, so nothing is recorded.
export function printerSetupPdf(): Promise<Blob> {
  return fetchPdf(() => apiClient.get<Blob>('/cards/printer-setup', { responseType: 'blob' }));
}

// Opens the browser's print dialog for a PDF without leaving the page: the
// PDF loads in a hidden frame and that frame prints. At a desk running
// Chrome with --kiosk-printing, this prints straight to the card printer
// with no dialog. Returns the object URL too, so the screen can offer
// "open the file" if the browser blocks frame printing.
export function printPdfBlob(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.style.opacity = '0';
  frame.src = url;
  frame.onload = () => {
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, '_blank', 'noopener');
      }
    }, 300);
  };
  document.body.appendChild(frame);
  // Leave the frame long enough for the print dialog; then tidy up.
  setTimeout(() => frame.remove(), 60_000);
  return url;
}
