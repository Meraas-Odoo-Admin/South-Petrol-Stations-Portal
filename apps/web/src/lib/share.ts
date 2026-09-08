// Round 15 (vehicle QR share). Feature-detected, not user-agent-sniffed —
// `navigator.canShare({ files })` is the real signal for whether the OS
// share sheet can take a file; a tablet or unusual browser can legitimately
// go either way, so this is checked directly rather than guessed from
// platform.
export function canShareFiles(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}

// Round 20: WhatsApp's `phone` param wants plain international-format
// digits — country code then the number, no "+", no leading "0". The
// owner's phone is stored/typed in any of the three shapes
// LIBYAN_MOBILE_REGEX accepts (local "0912345678", bare "912345678", or
// already-international "+218912345678") — this normalizes whichever one
// arrives into what WhatsApp expects.
function toWhatsAppPhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('218')) return digits;
  if (digits.startsWith('0')) return `218${digits.slice(1)}`;
  return `218${digits}`;
}

// Round 15: WhatsApp's own link scheme can carry no phone number at all —
// the person picks the recipient themselves in their own WhatsApp — which
// was the only option while owner phone was optional/unreliable. Round 20:
// the owner's phone is now required at vehicle onboarding specifically so
// this can open a chat with THEM directly (`phone` param) instead of
// leaving the recipient to be picked by hand; the no-phone form is kept as
// a fallback for the small number of pre-existing owners who predate that
// requirement. Either way this can prefill text but, per WhatsApp's own
// API, cannot attach a file — why this is only ever the second half of a
// two-step desktop flow (download the PNG, then open this link) rather
// than a one-click share.
export function buildWhatsAppComposeUrl(text: string, phone?: string | null): string {
  const params = new URLSearchParams({ text });
  if (phone) params.set('phone', toWhatsAppPhoneDigits(phone));
  return `https://api.whatsapp.com/send?${params.toString()}`;
}
