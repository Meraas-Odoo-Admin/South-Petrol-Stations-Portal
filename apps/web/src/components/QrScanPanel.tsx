import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { apiClient } from '../lib/apiClient';
import { PillButton } from './design/PillButton';
import { LtrText } from './LtrText';

interface ResolvedVehicle {
  id: string;
  internalCode: string;
  currentPlate: string;
}

interface QrScanPanelProps {
  variant: 'phone' | 'desktop';
  onResolved: (vehicle: ResolvedVehicle) => void;
  onCancel: () => void;
  onCameraUnavailable: () => void;
}

type Stage = 'pre-permission' | 'scanning' | 'denied' | 'unrecognized';

// Round 15 (scan-in). A decoded string is only ever treated as a real
// vehicle when it EXACTLY matches a vehicle's own internalCode — not
// merely "the search endpoint returned something," since that endpoint
// also ORs against plate/chassis/owner name/id and an arbitrary scanned
// garbage string could accidentally substring-collide with one of those.
// Every vehicle's own QR always encodes its internalCode by construction
// (see VehicleQrPanel), so a genuine scan always satisfies this exactly.
async function resolveInternalCode(code: string): Promise<ResolvedVehicle | null> {
  const res = await apiClient.get<ResolvedVehicle[]>('/vehicles', { params: { search: code, take: 5 } });
  return res.data.find((v) => v.internalCode === code) ?? null;
}

// One component for both the phone full-screen viewfinder (14a³/14b) and
// the desktop in-page panel (14c²/14d) — same state machine, only the
// wrapping chrome (fixed full-screen overlay vs. an absolutely-positioned
// panel over the half-filled form) differs. Decoding is continuous
// (`decodeFromVideoDevice`) rather than a single-shot capture, matching
// how a real handheld scan naturally works — the callback fires on every
// video frame, most of which simply find nothing (not an error condition).
export function QrScanPanel({ variant, onResolved, onCancel, onCameraUnavailable }: QrScanPanelProps) {
  const [stage, setStage] = useState<Stage>('pre-permission');
  const [decodedCode, setDecodedCode] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  // Guards against the continuous decode loop re-processing the same
  // decoded frame many times per second while a lookup is already in
  // flight or the unrecognized-code state is already showing.
  const handlingRef = useRef(false);

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
    };
  }, []);

  async function openCamera() {
    handlingRef.current = false;
    if (!readerRef.current) {
      readerRef.current = new BrowserQRCodeReader();
    }
    try {
      setStage('scanning');
      const controls = await readerRef.current.decodeFromVideoDevice(
        undefined,
        videoRef.current ?? undefined,
        (result) => {
          if (!result || handlingRef.current) return;
          handlingRef.current = true;
          const text = result.getText().trim();
          resolveInternalCode(text)
            .then((vehicle) => {
              if (vehicle) {
                controlsRef.current?.stop();
                onResolved(vehicle);
              } else {
                setDecodedCode(text);
                setStage('unrecognized');
              }
            })
            .catch(() => {
              setDecodedCode(text);
              setStage('unrecognized');
            })
            .finally(() => {
              handlingRef.current = false;
            });
        },
      );
      controlsRef.current = controls;
    } catch {
      // getUserMedia rejected: permission denied, no camera hardware, or
      // an insecure context slipping through the offer's own feature-gate.
      setStage('denied');
      onCameraUnavailable();
    }
  }

  function rescan() {
    setDecodedCode(null);
    setStage('scanning');
  }

  function abandon() {
    controlsRef.current?.stop();
    onCancel();
  }

  const overlayClass =
    variant === 'phone'
      ? 'fixed inset-0 z-50 flex flex-col bg-[#0F1E1C]'
      : 'absolute inset-0 z-20 flex flex-col overflow-hidden rounded-md bg-[#0F1E1C] shadow-lg';

  return (
    <div className={overlayClass} data-testid="qr-scan-panel">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5 text-white">
        <div>
          <p className="text-[14px] font-extrabold">امسح رمز المركبة</p>
          <p className="text-[11px] opacity-70">وجّه الرمز نحو الكاميرا</p>
        </div>
        {variant === 'desktop' && (
          <button type="button" onClick={abandon} className="text-white/70 hover:text-white" aria-label="إغلاق">
            ✕
          </button>
        )}
      </div>

      {stage === 'pre-permission' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-white">
          <p className="text-[16px] font-extrabold">ستُستخدم الكاميرا لمسح رمز المركبة</p>
          <p className="max-w-sm text-[12.5px] leading-[1.8] opacity-80">
            تُقرأ صورة الرمز على الجهاز نفسه ولا تُحفَظ ولا تُرسَل. سيسألك جهازك عن الإذن بعد ضغط الزر.
          </p>
          <PillButton variant="primary" className="w-full max-w-xs justify-center" onClick={openCamera}>
            فتح الكاميرا
          </PillButton>
          <button type="button" onClick={onCancel} className="text-[12.5px] font-bold text-white/80 underline">
            اكتب رقم اللوحة بدلاً من ذلك
          </button>
        </div>
      )}

      {(stage === 'scanning' || stage === 'unrecognized') && (
        <div className="relative flex flex-1 flex-col">
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              className={`h-full w-full object-cover ${stage === 'unrecognized' ? 'opacity-40' : ''}`}
              muted
              playsInline
            />
            {stage === 'scanning' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-40 w-40 rounded-lg border-4 border-transparent">
                  <div className="relative h-full w-full">
                    <span className="absolute -top-1 -start-1 h-8 w-8 rounded-tl-lg border-s-4 border-t-4 border-accent" />
                    <span className="absolute -top-1 -end-1 h-8 w-8 rounded-tr-lg border-e-4 border-t-4 border-accent" />
                    <span className="absolute -bottom-1 -start-1 h-8 w-8 rounded-bl-lg border-b-4 border-s-4 border-accent" />
                    <span className="absolute -bottom-1 -end-1 h-8 w-8 rounded-br-lg border-b-4 border-e-4 border-accent" />
                  </div>
                </div>
              </div>
            )}
            {stage === 'unrecognized' && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-accent-100 p-3.5 text-center">
                <p className="text-[12.5px] font-bold text-accent-dark">هذا الرمز لا يقابل أي مركبة في المنظومة</p>
                <p className="mt-1 text-[11.5px] text-accent-dark">
                  الرقم المقروء: <LtrText>{decodedCode}</LtrText>. تأكّد أن الرمز صادر من هذه المنظومة، أو اكتب رقم
                  اللوحة يدويًا.
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-white/10 bg-[#0F1E1C] p-4">
            {stage === 'unrecognized' ? (
              <div className="flex flex-wrap gap-2">
                <PillButton variant="secondary" onClick={rescan}>
                  مسح آخر
                </PillButton>
                <PillButton variant="primary" onClick={onCancel}>
                  اكتب رقم اللوحة بدلاً من ذلك
                </PillButton>
              </div>
            ) : (
              <PillButton
                variant={variant === 'phone' ? 'secondary' : 'primary'}
                className="w-full justify-center"
                onClick={abandon}
              >
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
            إن كنت قد منعت الإذن فيمكنك السماح به من إعدادات الجهاز، وإلى ذلك الحين اكتب رقم اللوحة يدويًا —
            الطريقان يؤدّيان إلى النتيجة نفسها.
          </p>
          <PillButton variant="primary" onClick={onCancel}>
            اكتب رقم اللوحة بدلاً من ذلك
          </PillButton>
        </div>
      )}
    </div>
  );
}
