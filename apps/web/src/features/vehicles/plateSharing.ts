// After review (19 Oct 2026): a plate is shared by two vehicles at most, and
// only when their vehicle types differ. The API's refusals, in words.
export function plateSharingMessage(code: unknown, details?: { otherType?: string | null; vehicle?: string; vehicles?: string[] }): string | null {
  switch (code) {
    case 'PLATE_SHARED_LIMIT':
      return 'رقم اللوحة هذا مسجّل لمركبتين بالفعل، ولا يمكن تكراره أكثر من مرة واحدة.';
    case 'PLATE_SHARED_TYPE_REQUIRED':
      return `رقم اللوحة مسجّل لمركبة أخرى${details?.otherType ? ` من نوع «${details.otherType}»` : ''}. اختر نوع هذه المركبة، ويجب أن يكون مختلفًا عنه.`;
    case 'PLATE_SHARED_SAME_TYPE':
      return `رقم اللوحة مسجّل لمركبة أخرى من نفس النوع${details?.otherType ? ` («${details.otherType}»)` : ''}. لا تتشارك مركبتان اللوحة إلا إذا اختلف نوعهما.`;
    case 'PLATE_SHARED_OTHER_NO_TYPE':
      return `رقم اللوحة مسجّل لمركبة أخرى (${details?.vehicle ?? '—'}) ليس لها نوع مركبة. حدّد نوعها أولًا، ثم يمكن أن تتشارك اللوحة مع مركبة من نوع مختلف.`;
    default:
      return null;
  }
}
