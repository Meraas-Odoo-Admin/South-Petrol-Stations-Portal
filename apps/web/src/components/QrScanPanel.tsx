import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import { isAxiosError } from 'axios';
import { apiClient } from '../lib/apiClient';
import { ScanSession } from '../lib/cameraScanSession';
import { PillButton } from './design/PillButton';
import { LtrText } from './LtrText';

// GET /cards/scan/:cardNumber — registration pivot, phase 3. The QR on a
// printed card carries the CARD number (e.g. SBH-7K2M9Q4X), never the
// vehicle's internalCode; the old internalCode QR codes are no longer
// accepted (no real cards were ever printed with them).
export interface ScannedCard {
  cardNumber: string;
  needsReissue: boolean;
  vehicle: {
    id: string;
    internalCode: string;
    currentPlate: string;
    make?: string | null;
    model: string | null;
    fuelType?: 'PETROL' | 'DIESEL' | null;
    color: string | null;
    vehicleType: { name: string } | null;
    // What the printed card shows, for the confirmation at the pump.
    manufactureYear?: number | null;
    chassisNumber?: string | null;
    registrationBooklet?: string | null;
    owner?: { fullName: string } | null;
  };
}

interface QrScanPanelProps {
  // 'inline': the scan-first plate step's embedded viewfinder. 'phone' /
  // 'desktop': the full-screen / in-panel overlays.
  variant: 'inline' | 'phone' | 'desktop';
  autoStart?: boolean;
  onResolved: (card: ScannedCard) => void;
  onCancel: () => void;
  onCameraUnavailable: () => void;
}

// 'revoked' / 'not-a-card' come from the API's codes (CARD_REVOKED /
// CARD_NOT_FOUND) — the Arabic lives here, never in the API.
type Stage = 'pre-permission' | 'scanning' | 'denied' | 'not-a-card' | 'revoked' | 'error';

const OUTCOME_MESSAGES: Record<'not-a-card' | 'revoked' | 'error', { title: string; body: string }> = {
  'not-a-card': {
    title: 'تعذّرت قراءة البطاقة',
    body: 'نظّف الكاميرا وأعد المحاولة، أو اطلب من صاحب المركبة مراجعة مكتب التسجيل لإعادة طباعة البطاقة.',
  },
  revoked: {
    title: 'هذه البطاقة ملغاة',
    body: 'لا يمكن التعبئة بهذه البطاقة. اطلب من صاحب المركبة مراجعة مكتب التسجيل لاستلام بطاقة جديدة.',
  },
  error: {
    title: 'تعذر التحقق من البطاقة',
    body: 'تحقّق من الاتصال ثم امسح مرة أخرى.',
  },
};

// One scanner for every home — the same state machine; only the wrapping
// chrome differs by `variant`. Decoding is continuous: most video frames
// simply find nothing, which isn't an error.
export function QrScanPanel({ variant, autoStart = false, onResolved, onCancel, onCameraUnavailable }: QrScanPanelProps) {
  const [stage, setStage] = useState<Stage>(autoStart ? 'scanning' : 'pre-permission');
  const [decodedCode, setDecodedCode] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // The scan in progress. Everything about the camera (opening it, the decode
  // loop, releasing every track, "done after the first card") lives in
  // ScanSession; this panel only shows its state.
  const sessionRef = useRef<ScanSession<ScannedCard> | null>(null);
  // The latest session's "fully released" promise: a new session (React
  // StrictMode mounts twice in dev, or the screen reopens) waits for it.
  const latestClosedRef = useRef<Promise<void> | undefined>(undefined);

  async function openCamera() {
    const session = new ScanSession<ScannedCard>(
      {
        getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
        createReader: () => new BrowserQRCodeReader(),
        lookUp: async (text) => (await apiClient.get<ScannedCard>(`/cards/scan/${encodeURIComponent(text)}`)).data,
      },
      {
        // Exactly once per scan; the session has already released the camera.
        onResolved: (card) => onResolved(card),
        onLookupFailed: (text, error) => {
          setDecodedCode(text);
          if (isAxiosError(error) && error.response?.status === 409) setStage('revoked');
          else if (isAxiosError(error) && error.response?.status === 404) setStage('not-a-card');
          else setStage('error');
        },
      },
    );
    const after = latestClosedRef.current;
    latestClosedRef.current = session.closed;
    sessionRef.current = session;
    setStage('scanning');
    try {
      await session.start(() => videoRef.current, after);
      // Flashlight: only where the camera track itself reports torch support
      // (Chrome on Android). Elsewhere, e.g. iOS Safari, the toggle isn't shown.
      if (sessionRef.current === session) setTorchAvailable(session.torchSupported);
    } catch {
      // getUserMedia rejected: permission denied, no camera, or an
      // insecure context.
      if (sessionRef.current !== session) return;
      setStage('denied');
      onCameraUnavailable();
    }
  }

  useEffect(() => {
    if (autoStart) void openCamera();
    return () => {
      // Unmount: release the camera for certain, even if it is still opening.
      void sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  async function toggleTorch() {
    const next = !torchOn;
    try {
      await sessionRef.current?.setTorch(next);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }

  function rescan() {
    setDecodedCode(null);
    sessionRef.current?.rescan();
    setStage('scanning');
  }

  function abandon() {
    void sessionRef.current?.stop();
    onCancel();
  }

  const overlayClass =
    variant === 'phone'
      ? 'fixed inset-0 z-50 flex flex-col bg-[#0F1E1C]'
      : variant === 'desktop'
        ? 'absolute inset-0 z-20 flex flex-col overflow-hidden rounded-md bg-[#0F1E1C] shadow-lg'
        : // After review (18 Oct 2026): 40% of the screen, not 62% — on a phone the
          // way out under it («البطاقة لا تعمل؟») now shows without scrolling.
          'relative flex h-[40vh] min-h-[280px] max-h-[440px] flex-col overflow-hidden rounded-md bg-[#0F1E1C]';
  const outcome = stage === 'not-a-card' || stage === 'revoked' || stage === 'error' ? OUTCOME_MESSAGES[stage] : null;

  return (
    <div className={overlayClass} data-testid="qr-scan-panel">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3.5 text-white">
        <div>
          <p className="text-[16px] lg:text-[14px] font-extrabold">امسح بطاقة المركبة</p>
          <p className="text-[13px] lg:text-[12px] opacity-70">وجّه رمز البطاقة نحو الكاميرا</p>
        </div>
        <div className="flex items-center gap-2">
          {torchAvailable && stage === 'scanning' && (
            <button
              type="button"
              onClick={toggleTorch}
              data-testid="qr-scan-torch"
              aria-pressed={torchOn}
              className={`rounded-full px-3 py-1.5 text-[13px] lg:text-[12px] font-bold ${torchOn ? 'bg-accent text-ink' : 'bg-white/10 text-white'}`}
            >
              {torchOn ? 'إطفاء الضوء' : 'تشغيل الضوء'}
            </button>
          )}
          {variant === 'desktop' && (
            <button type="button" onClick={abandon} className="text-white/70 hover:text-white" aria-label="إغلاق">
              ✕
            </button>
          )}
        </div>
      </div>

      {stage === 'pre-permission' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-white">
          <p className="text-[16px] font-extrabold">ستُستخدم الكاميرا لمسح بطاقة المركبة</p>
          <p className="max-w-sm text-[13px] lg:text-[12.5px] leading-[1.8] opacity-80">
            تُقرأ صورة الرمز على الجهاز نفسه ولا تُحفَظ ولا تُرسَل. سيسألك جهازك عن الإذن بعد ضغط الزر.
          </p>
          <PillButton variant="primary" className="w-full max-w-xs justify-center" onClick={openCamera}>
            فتح الكاميرا
          </PillButton>
        </div>
      )}

      {(stage === 'scanning' || outcome) && (
        // min-h-0 down the chain: a flex item won't shrink below its content
        // by default, and the camera stream's own size (a tall portrait one
        // on a phone) would push the bottom bar, and the
        // buttons in it, out of the panel.
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {/* Absolutely positioned: the video fills the area and never
                contributes to its size. */}
            <video
              ref={videoRef}
              className={`absolute inset-0 h-full w-full object-cover ${outcome ? 'opacity-40' : ''}`}
              muted
              playsInline
            />
            {stage === 'scanning' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {/* Phase 7: the four corner marks as one drawn shape (the thick-border
                    corners clashed with their rounding, and their sides did not follow RTL). */}
                <svg viewBox="0 0 176 176" className="h-44 w-44 text-accent" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 36V16a12 12 0 0 1 12-12h20M140 4h20a12 12 0 0 1 12 12v20M172 140v20a12 12 0 0 1-12 12h-20M36 172H16a12 12 0 0 1-12-12v-20" />
                </svg>
              </div>
            )}
            {outcome && (
              <div
                className={`absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md p-3.5 text-center ${
                  stage === 'revoked' ? 'bg-danger-100' : 'bg-accent-100'
                }`}
                data-testid={`qr-scan-outcome-${stage}`}
              >
                <p className={`text-[15px] lg:text-[13px] font-bold ${stage === 'revoked' ? 'text-danger-dark' : 'text-accent-ink'}`}>
                  {outcome.title}
                </p>
                <p className="mt-1 text-[13px] lg:text-[12px] text-ink-soft">{outcome.body}</p>
                {decodedCode && (
                  <p className="mt-1 text-[13px] lg:text-[12px] text-ink-faint">
                    الرمز المقروء: <LtrText>{decodedCode}</LtrText>
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 bg-[#0F1E1C] p-4">
            {outcome ? (
              <div className="flex flex-wrap gap-2">
                <PillButton variant="primary" onClick={rescan} data-testid="qr-scan-retry">
                  إعادة المحاولة
                </PillButton>
              </div>
            ) : variant === 'inline' ? null : (
              <PillButton variant={variant === 'phone' ? 'secondary' : 'primary'} className="w-full justify-center" onClick={abandon}>
                إلغاء
              </PillButton>
            )}
            <p className="text-center text-[13px] lg:text-[12px] text-white/50">لا شيء يُحفظ من الكاميرا</p>
          </div>
        </div>
      )}

      {stage === 'denied' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-white">
          {/* Phase 7 (critique): light text on the dark scanner panel (red was 3.4:1 here). */}
          <p role="alert" className="text-[16px] font-extrabold text-danger-100">⚠ لا يمكن فتح الكاميرا على هذا الجهاز</p>
          <p className="max-w-sm text-[13px] lg:text-[12px] leading-[1.8] opacity-80">
            اسمح بالكاميرا من إعدادات الجهاز ثم أعد المحاولة، أو اطلب من المشرف.
          </p>
          <PillButton variant="primary" size="field" className="shadow-none" onClick={() => void openCamera()} data-testid="qr-scan-retry-camera">
            إعادة المحاولة
          </PillButton>
        </div>
      )}
    </div>
  );
}
