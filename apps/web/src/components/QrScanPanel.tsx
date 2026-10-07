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
    model: string | null;
    color: string | null;
    vehicleType: { name: string } | null;
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
    title: 'هذا الرمز ليس بطاقة من هذه المنظومة',
    body: 'تأكّد أن البطاقة صادرة من أحد مكاتب التسجيل، أو اكتب رقم اللوحة يدويًا.',
  },
  revoked: {
    title: 'هذه البطاقة ملغاة — راجع مكتب التسجيل لاستلام بطاقة جديدة',
    body: 'لا يمكن التعبئة بهذه البطاقة.',
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

  const typePlateLabel = 'اكتب رقم اللوحة بدلاً من ذلك';
  const overlayClass =
    variant === 'phone'
      ? 'fixed inset-0 z-50 flex flex-col bg-[#0F1E1C]'
      : variant === 'desktop'
        ? 'absolute inset-0 z-20 flex flex-col overflow-hidden rounded-md bg-[#0F1E1C] shadow-lg'
        : 'relative flex h-[62vh] min-h-[360px] flex-col overflow-hidden rounded-md bg-[#0F1E1C]';
  const outcome = stage === 'not-a-card' || stage === 'revoked' || stage === 'error' ? OUTCOME_MESSAGES[stage] : null;

  return (
    <div className={overlayClass} data-testid="qr-scan-panel">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3.5 text-white">
        <div>
          <p className="text-[14px] font-extrabold">امسح بطاقة المركبة</p>
          <p className="text-[11px] opacity-70">وجّه رمز البطاقة نحو الكاميرا</p>
        </div>
        <div className="flex items-center gap-2">
          {torchAvailable && stage === 'scanning' && (
            <button
              type="button"
              onClick={toggleTorch}
              data-testid="qr-scan-torch"
              aria-pressed={torchOn}
              className={`rounded-full px-3 py-1.5 text-[11.5px] font-bold ${torchOn ? 'bg-accent text-white' : 'bg-white/10 text-white'}`}
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
          <p className="max-w-sm text-[12.5px] leading-[1.8] opacity-80">
            تُقرأ صورة الرمز على الجهاز نفسه ولا تُحفَظ ولا تُرسَل. سيسألك جهازك عن الإذن بعد ضغط الزر.
          </p>
          <PillButton variant="primary" className="w-full max-w-xs justify-center" onClick={openCamera}>
            فتح الكاميرا
          </PillButton>
          <button type="button" onClick={onCancel} className="text-[12.5px] font-bold text-white/80 underline">
            {typePlateLabel}
          </button>
        </div>
      )}

      {(stage === 'scanning' || outcome) && (
        // min-h-0 down the chain: a flex item won't shrink below its content
        // by default, and the camera stream's own size (a tall portrait one
        // on a phone) would push the bottom bar, and the "type the plate"
        // link in it, out of the panel.
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
                <div className="relative h-44 w-44">
                  <span className="absolute -top-1 -start-1 h-8 w-8 rounded-tl-lg border-s-4 border-t-4 border-accent" />
                  <span className="absolute -top-1 -end-1 h-8 w-8 rounded-tr-lg border-e-4 border-t-4 border-accent" />
                  <span className="absolute -bottom-1 -start-1 h-8 w-8 rounded-bl-lg border-b-4 border-s-4 border-accent" />
                  <span className="absolute -bottom-1 -end-1 h-8 w-8 rounded-br-lg border-b-4 border-e-4 border-accent" />
                </div>
              </div>
            )}
            {outcome && (
              <div
                className={`absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md p-3.5 text-center ${
                  stage === 'revoked' ? 'bg-danger-100' : 'bg-accent-100'
                }`}
                data-testid={`qr-scan-outcome-${stage}`}
              >
                <p className={`text-[13px] font-bold ${stage === 'revoked' ? 'text-danger-dark' : 'text-accent-dark'}`}>
                  {outcome.title}
                </p>
                <p className="mt-1 text-[11.5px] text-ink-soft">{outcome.body}</p>
                {decodedCode && (
                  <p className="mt-1 text-[11px] text-ink-faint">
                    الرمز المقروء: <LtrText>{decodedCode}</LtrText>
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 bg-[#0F1E1C] p-4">
            {outcome ? (
              <div className="flex flex-wrap gap-2">
                <PillButton variant="secondary" onClick={rescan}>
                  مسح آخر
                </PillButton>
                <PillButton variant="primary" onClick={abandon}>
                  {typePlateLabel}
                </PillButton>
              </div>
            ) : variant === 'inline' ? (
              <button
                type="button"
                onClick={abandon}
                data-testid="fillup-type-plate-instead"
                className="text-center text-[12px] font-bold text-white/80 underline"
              >
                البطاقة تالفة أو غير موجودة؟ اكتب رقم اللوحة
              </button>
            ) : (
              <PillButton variant={variant === 'phone' ? 'secondary' : 'primary'} className="w-full justify-center" onClick={abandon}>
                إلغاء
              </PillButton>
            )}
            <p className="text-center text-[10.5px] text-white/50">لا شيء يُحفظ من الكاميرا</p>
          </div>
        </div>
      )}

      {stage === 'denied' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-white">
          <p className="text-[15px] font-extrabold text-danger">لا يمكن فتح الكاميرا على هذا الجهاز</p>
          <p className="max-w-sm text-[12px] leading-[1.8] opacity-80">
            إن كنت قد منعت الإذن فيمكنك السماح به من إعدادات الجهاز، وإلى ذلك الحين اكتب رقم اللوحة يدويًا.
          </p>
          <PillButton variant="primary" onClick={onCancel} data-testid="fillup-type-plate-instead">
            {typePlateLabel}
          </PillButton>
        </div>
      )}
    </div>
  );
}
