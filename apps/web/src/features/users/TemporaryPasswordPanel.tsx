import { useState } from 'react';
import { PillButton } from '../../components/design/PillButton';
import { Icon, ICONS } from '../../components/icons';

// The one-time password after creating an account or resetting one. It is
// shown here and nowhere else: the server keeps only a hash and no other
// endpoint returns it. Large and left-to-right so it can be read aloud or
// copied correctly; the warning says plainly that it will not be shown again.
export function TemporaryPasswordPanel({ password, who }: { password: string; who: string }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  }

  return (
    <div className="rounded-md bg-accent-100 p-4 lg:p-5">
      <p className="text-[16px] font-extrabold text-ink lg:text-[14px]">كلمة المرور المؤقتة لـ {who}</p>
      {/* One line at every width, never wrapped: 14 monospace characters take
          about 8.4em, so the size follows the screen (6.4vw, at most 28px) and
          the text is not allowed to break. The hyphens keep the three groups
          readable. */}
      <p
        dir="ltr"
        data-testid="temporary-password"
        style={{ fontSize: 'min(28px, 6.4vw)' }}
        className="my-3 select-all whitespace-nowrap rounded-sm bg-surface px-2 py-4 text-center font-mono font-extrabold tracking-[0.04em] text-ink"
      >
        {password}
      </p>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <PillButton size="field" variant="secondary" onClick={copy}>
          <span className="inline-flex items-center justify-center gap-2">
            <Icon d={copied === 'yes' ? ICONS.check : ICONS.copy} size={18} />
            {copied === 'yes' ? 'تم النسخ' : 'نسخ كلمة المرور'}
          </span>
        </PillButton>
        {copied === 'failed' && (
          <span role="alert" className="text-[14px] font-medium text-danger-dark lg:text-[12px]">
            تعذّر النسخ تلقائيًا — حدّد الكلمة أعلاه وانسخها يدويًا.
          </span>
        )}
      </div>
      <p className="mt-3 text-[15px] leading-[1.7] text-ink lg:text-[13px]">
        تظهر هذه الكلمة <strong>مرة واحدة فقط</strong> ولن يمكن عرضها بعد مغادرة هذه الصفحة. سلّمها للشخص مباشرة؛
        سيُطلب منه اختيار كلمة مرور جديدة عند أول دخول.
      </p>
    </div>
  );
}
