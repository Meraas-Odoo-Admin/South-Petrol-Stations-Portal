import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Icon, ICONS } from '../icons';

// The shared form-field pattern (DESIGN.md, "Inputs / Fields"): a label tied
// to its input, an optional hint, and two states that always say something.
//
//  - ERROR: red border plus an icon and a sentence under the field, never
//    colour alone. The message is a broken-rule message in plain Arabic and
//    says what to do. Announced to screen readers (role="alert").
//  - DISABLED: a faded field that always explains WHY in a line under it
//    (`disabledReason`), so a locked field is never a silent dead end.
//
// Sizes follow the phase 4b minimums: 16px text on a phone, 14px on a
// desktop; the label never drops below 13px / 12px.
const FIELD_BASE =
  'w-full rounded-sm border bg-surface-alt px-3.5 text-[16px] text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary-dark focus:ring-offset-2 focus:ring-offset-surface lg:text-[14px]';

function stateClasses(error: boolean, disabled: boolean): string {
  if (disabled) return 'cursor-not-allowed border-line bg-surface-alt/60 text-ink-soft';
  if (error) return 'border-danger';
  return 'border-line';
}

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[14px] font-bold text-ink lg:text-[12px]">
      {children}
    </label>
  );
}

export function FieldMessage({ id, error, hint, disabledReason }: { id: string; error?: string | null; hint?: string; disabledReason?: string }) {
  if (error) {
    return (
      <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-[14px] font-medium text-danger-dark lg:text-[12px]">
        <span className="mt-0.5 shrink-0">
          <Icon d={ICONS.violations} size={16} />
        </span>
        <span>{error}</span>
      </p>
    );
  }
  if (disabledReason) {
    return (
      <p id={id} className="mt-1.5 flex items-start gap-1.5 text-[14px] text-ink-soft lg:text-[12px]">
        <span className="mt-0.5 shrink-0">
          <Icon d={ICONS.lock} size={16} />
        </span>
        <span>{disabledReason}</span>
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="mt-1.5 text-[14px] text-ink-soft lg:text-[12px]">
        {hint}
      </p>
    );
  }
  return null;
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  hint?: string;
  error?: string | null;
  /** Set together with `disabled`: the reason shown under the field. */
  disabledReason?: string;
  /** Codes, usernames and phone numbers read left-to-right. */
  ltr?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, disabledReason, ltr = false, id, disabled, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const messageId = `${fieldId}-msg`;
  const hasMessage = Boolean(error || disabledReason || hint);
  return (
    <div>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <input
        ref={ref}
        id={fieldId}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={hasMessage ? messageId : undefined}
        dir={ltr ? 'ltr' : undefined}
        className={`h-[52px] ${FIELD_BASE} ${ltr ? 'text-end' : ''} ${stateClasses(Boolean(error), Boolean(disabled))}`}
        {...rest}
      />
      <FieldMessage id={messageId} error={error} hint={hint} disabledReason={disabled ? disabledReason : undefined} />
    </div>
  );
});

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  label: string;
  hint?: string;
  error?: string | null;
}

export function TextAreaField({ label, hint, error, id, ...rest }: TextAreaFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const messageId = `${fieldId}-msg`;
  return (
    <div>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        rows={3}
        className={`min-h-[96px] py-3 ${FIELD_BASE} ${stateClasses(Boolean(error), false)}`}
        {...rest}
      />
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}
