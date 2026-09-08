import { useRef, useState, type CSSProperties } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeCanvas } from 'qrcode.react';
import { Card, CardHeader } from './design/Card';
import { PillButton } from './design/PillButton';
import { LtrText } from './LtrText';
import { downloadBlob } from '../lib/download';
import { canShareFiles, buildWhatsAppComposeUrl } from '../lib/share';
import { apiClient } from '../lib/apiClient';
import { restrictToPhoneNumber, LIBYAN_MOBILE_REGEX } from '../lib/libyanFormats';

interface VehicleQrPanelProps {
  internalCode: string;
  vehicleLabel?: string;
  variant: 'full' | 'compact';
  className?: string;
  style?: CSSProperties;
  // Round 20: the owner's WhatsApp number. When present, "فتح واتساب" opens
  // a chat with them directly. When absent (an owner who predates the
  // phone-required rule), clicking the button asks for one on the spot
  // instead — see handleOpenWhatsApp. ownerId is only needed to offer
  // saving that number back onto the owner record for next time.
  ownerPhone?: string | null;
  ownerId?: string;
}

function canvasToPngFile(canvas: HTMLCanvasElement, filename: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('QR canvas produced no image data'));
        return;
      }
      resolve(new File([blob], filename, { type: 'image/png' }));
    }, 'image/png');
  });
}

// Round 15 (vehicle QR + share). One component for both homes — vehicle
// detail's permanent card and the fill-up success screen's compact
// version — since the QR/code/share mechanics are identical; only spacing
// and how much explanatory chrome is shown differ (`variant`). The payload
// is always `internalCode` alone: not the plate (changes over time, see
// CLAUDE.md rule 1) and not a link (the record needs a login, so a link is
// useless to an outside scanner) — see design/design_handoff_fuel_control_system/README.md
// §"Round 3 — vehicle QR + share".
export function VehicleQrPanel({
  internalCode,
  vehicleLabel,
  variant,
  className = '',
  style,
  ownerPhone,
  ownerId,
}: VehicleQrPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);
  const [promptPhone, setPromptPhone] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);
  const [savePhone, setSavePhone] = useState(true);

  const savePhoneMutation = useMutation({
    mutationFn: (phone: string) => apiClient.patch(`/owners/${ownerId}`, { phone }),
    onSuccess: () => {
      if (ownerId) queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const filename = `${internalCode}.png`;
  const shareText = vehicleLabel
    ? `رمز المركبة الداخلي: ${internalCode} — ${vehicleLabel}. صورة الرمز مرفقة.`
    : `الرقم الداخلي للمركبة: ${internalCode}. صورة الرمز مرفقة.`;

  // Feature-detected once, not sniffed from user agent — a tablet or
  // unusual browser can legitimately land on either side. A throwaway file
  // is enough to ask navigator.canShare whether file-sharing is supported
  // at all; the real QR PNG is only generated lazily when actually shared.
  const [phoneShareSupported] = useState(() => {
    try {
      return canShareFiles(new File([''], filename, { type: 'image/png' }));
    } catch {
      return false;
    }
  });

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(internalCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied or unavailable — no fallback needed,
      // the code is already printed in plain legible text beside the QR.
    }
  }

  async function handlePhoneShare() {
    if (!canvasRef.current) return;
    setShareError(false);
    try {
      const file = await canvasToPngFile(canvasRef.current, filename);
      await navigator.share({ files: [file], text: shareText });
      setShared(true);
    } catch (err) {
      // AbortError = the user cancelled the OS share sheet — not a real
      // failure, nothing to surface.
      if (err instanceof Error && err.name !== 'AbortError') {
        setShareError(true);
      }
    }
  }

  async function handleDownload() {
    if (!canvasRef.current) return;
    const file = await canvasToPngFile(canvasRef.current, filename);
    downloadBlob(file, filename);
    setDownloaded(true);
  }

  function handleOpenWhatsApp() {
    if (ownerPhone) {
      window.open(buildWhatsAppComposeUrl(shareText, ownerPhone), '_blank', 'noopener,noreferrer');
      return;
    }
    setPromptPhone('');
    setPromptError(null);
    setSavePhone(true);
    setShowPhonePrompt(true);
  }

  function handleConfirmPhonePrompt() {
    const phone = promptPhone.trim();
    if (!LIBYAN_MOBILE_REGEX.test(phone)) {
      setPromptError('أدخل رقم هاتف ليبي صحيح يحمل تطبيق واتساب (مثال: 0912345678).');
      return;
    }
    window.open(buildWhatsAppComposeUrl(shareText, phone), '_blank', 'noopener,noreferrer');
    if (savePhone && ownerId) {
      savePhoneMutation.mutate(phone);
    }
    setShowPhonePrompt(false);
  }

  const qrSize = variant === 'full' ? 160 : 104;

  return (
    <Card className={className} style={style}>
      {variant === 'full' && <CardHeader title="رمز المركبة" />}
      <div className="p-4">
        <div className="flex flex-wrap items-start gap-4">
          <QRCodeCanvas ref={canvasRef} value={internalCode} size={qrSize} marginSize={2} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-faint">الرقم الداخلي للمركبة</p>
            <p className={`mt-0.5 font-black text-primary ${variant === 'full' ? 'text-[24px]' : 'text-[19px]'}`}>
              <LtrText>{internalCode}</LtrText>
            </p>
            {variant === 'full' && (
              <p className="mt-1.5 text-[11.5px] leading-[1.7] text-ink-soft">
                رقم ثابت لا يتغيّر بتغيّر اللوحة. يكفي مسح الرمز أو كتابته يدويًا.
              </p>
            )}
            <PillButton variant="secondary" size="sm" className="mt-2.5" onClick={handleCopyCode}>
              {copied ? '✓ تم النسخ' : 'نسخ الرقم'}
            </PillButton>
          </div>
        </div>

        <div className="mt-4 border-t border-surface-alt pt-4">
          {phoneShareSupported ? (
            <div className="sm:hidden">
              {shared && (
                <div className="mb-2.5 rounded-md bg-ok-100 p-3 text-[12px] leading-[1.7] text-ok">
                  <p className="font-bold">تمت مشاركة صورة الرمز</p>
                  <p className="mt-1 text-ink-soft">
                    لا تُسجَّل هذه المشاركة في سجل التغييرات — الرمز ليس بيانات محمية، وهو ثابت لا يتغيّر.
                  </p>
                </div>
              )}
              <PillButton variant="primary" className="w-full justify-center" onClick={handlePhoneShare}>
                {shared ? 'مشاركة مرة أخرى' : 'مشاركة صورة الرمز'}
              </PillButton>
              {shareError && <p className="mt-1.5 text-[11.5px] text-danger">تعذرت المشاركة — حاول مرة أخرى.</p>}
            </div>
          ) : null}

          {/* Desktop always gets the honest two-step flow, and phone falls
              back to it too when navigator.share/canShare isn't available
              (feature-detected above, not device-sniffed). */}
          <div className={phoneShareSupported ? 'hidden sm:block' : ''}>
            {variant === 'full' && (
              <p className="mb-2.5 text-[12.5px] font-bold text-ink">إرسال الرمز عبر واتساب</p>
            )}
            <p className="mb-2.5 text-[11.5px] leading-[1.7] text-ink-soft">
              لا يمكن للحاسوب إرفاق الصورة تلقائيًا — نزّل الصورة أولًا، ثم افتح واتساب وأرفقها بنفسك.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <PillButton variant="secondary" size="sm" onClick={handleDownload}>
                ١. تنزيل الصورة
              </PillButton>
              <PillButton variant="primary" size="sm" onClick={handleOpenWhatsApp}>
                ٢. فتح واتساب
              </PillButton>
            </div>
            {downloaded && (
              <p className="mt-1.5 text-[11px] text-ok">
                نزّلت باسم <LtrText>{filename}</LtrText> ✓
              </p>
            )}
          </div>
        </div>

        {variant === 'full' && (
          <p className="mt-4 text-[11px] leading-[1.7] text-ink-faint">
            الرمز يحمل الرقم الداخلي وحده — لا رقم اللوحة، لأنها تتغيّر مع الوقت — ولا رابطًا، لأنه لا يفتح شيئًا لمن
            هو خارج المنظومة.
          </p>
        )}
      </div>

      {showPhonePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowPhonePrompt(false)}
        >
          <div
            className="w-full max-w-sm rounded-md bg-surface p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[13px] font-bold text-ink">رقم هاتف المالك على واتساب غير مسجَّل</p>
            <p className="mt-1 text-[11.5px] leading-[1.7] text-ink-soft">
              أدخل رقم هاتف المالك الذي يحمل تطبيق واتساب لإرسال الرمز إليه مباشرة.
            </p>
            <input
              data-testid="owner-phone-prompt-input"
              value={promptPhone}
              onChange={(e) => setPromptPhone(restrictToPhoneNumber(e.target.value))}
              dir="ltr"
              placeholder="0912345678"
              autoFocus
              className="!pl-3 !pr-3 mt-3 h-10 w-full rounded-sm bg-surface-alt px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {promptError && <p className="mt-1.5 text-[11.5px] text-danger">{promptError}</p>}
            {ownerId && (
              <label className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                <input type="checkbox" checked={savePhone} onChange={(e) => setSavePhone(e.target.checked)} />
                حفظ هذا الرقم في بيانات المالك للمرات القادمة
              </label>
            )}
            <div className="mt-3.5 flex gap-2">
              <PillButton variant="primary" size="sm" onClick={handleConfirmPhonePrompt}>
                فتح واتساب
              </PillButton>
              <PillButton variant="ghost" size="sm" onClick={() => setShowPhonePrompt(false)}>
                إلغاء
              </PillButton>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
