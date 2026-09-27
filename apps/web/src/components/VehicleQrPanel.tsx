import { useState, type CSSProperties } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Card, CardHeader } from './design/Card';
import { PillButton } from './design/PillButton';
import { LtrText } from './LtrText';

interface VehicleQrPanelProps {
  internalCode: string;
  className?: string;
  style?: CSSProperties;
}

// Round 15 (vehicle QR). The payload is always `internalCode` alone: not
// the plate (changes over time, see CLAUDE.md rule 1) and not a link (the
// record needs a login, so a link is useless to an outside scanner).
//
// Registration pivot, phase 2: WhatsApp sharing is gone entirely (the
// share buttons, the download-then-open-WhatsApp flow and the owner-phone
// prompt), and so is the compact variant the fill-up success screen used —
// petrol stations no longer create vehicles. What's left is the QR itself
// on the vehicle page, unchanged; Phase 3 replaces this panel with the
// printed-card panel.
export function VehicleQrPanel({ internalCode, className = '', style }: VehicleQrPanelProps) {
  const [copied, setCopied] = useState(false);

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

  return (
    <Card className={className} style={style}>
      <CardHeader title="رمز المركبة" />
      <div className="p-4">
        <div className="flex flex-wrap items-start gap-4">
          <QRCodeCanvas value={internalCode} size={160} marginSize={2} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-faint">الرقم الداخلي للمركبة</p>
            <p className="mt-0.5 text-[24px] font-black text-primary">
              <LtrText>{internalCode}</LtrText>
            </p>
            <p className="mt-1.5 text-[11.5px] leading-[1.7] text-ink-soft">
              رقم ثابت لا يتغيّر بتغيّر اللوحة. يكفي مسح الرمز أو كتابته يدويًا.
            </p>
            <PillButton variant="secondary" size="sm" className="mt-2.5" onClick={handleCopyCode}>
              {copied ? '✓ تم النسخ' : 'نسخ الرقم'}
            </PillButton>
          </div>
        </div>

        <p className="mt-4 text-[11px] leading-[1.7] text-ink-faint">
          الرمز يحمل الرقم الداخلي وحده — لا رقم اللوحة، لأنها تتغيّر مع الوقت — ولا رابطًا، لأنه لا يفتح شيئًا لمن هو
          خارج المنظومة.
        </p>
      </div>
    </Card>
  );
}
