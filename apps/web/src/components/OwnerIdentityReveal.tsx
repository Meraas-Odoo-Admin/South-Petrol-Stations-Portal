import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../features/auth/AuthProvider';
import { LtrText } from './LtrText';
import { EyeIcon } from './EyeIcon';

interface OwnerIdentityRevealProps {
  ownerId: string;
  // Already masked per lib/masking.ts's rule (last-4-digits for a scoped
  // viewer, full value for reports:view_all_stations) — this component
  // only adds the click-to-reveal action on top, it doesn't decide the
  // masking rule itself.
  maskedValue: string;
  className?: string;
}

// Round 7 item 2: "wherever an owner's ID number is displayed, reuse the
// existing masked-ID-with-reveal-toggle pattern from the drivers list
// redesign (now the owner's, same component)" — ported to
// POST /owners/:id/reveal-identity (owners:reveal_identity), replacing the
// driver-scoped version removed in round 6. Same policy as the original:
// the reveal is the auditable action (server logs REVEAL_NATIONAL_ID),
// clicking through is what matters, not just holding the permission —
// this component never fetches the unmasked value until actually clicked.
//
// Bug found live (round 14): clicking used to swap straight from "masked
// text + eye icon button" to "plain revealed text, no button at all" — the
// icon didn't toggle, it just vanished with no re-mask option, which read
// as "the click didn't do anything, and now the button is gone" even
// though the reveal itself had worked. Now the button never disappears:
// the real value is fetched (and audited) once, cached locally, and every
// further click just toggles visibility client-side between masked/
// revealed with an eye / eye-off icon — the same pattern LoginPage's own
// password field already uses for the identical show/hide idea.
//
// Second bug found live, same round: for a viewer who already holds
// reports:view_all_stations, lib/masking.ts's maskIdentityNumber returns
// the FULL number as `maskedValue` in the first place (see its own
// comment — "full value only to supervisor+" IS that permission) — there
// was never anything masked to reveal for that viewer. The toggle button
// still rendered anyway, clicking it fetched and displayed the exact same
// string that was already showing, and toggling the icon with no visible
// change read as "the eye icon doesn't work." Now: if `maskedValue`
// contains no mask character at all, this is already the real value for
// this viewer — skip the whole interactive toggle and just show it, same
// as the `!canReveal` case below.
export function OwnerIdentityReveal({ ownerId, maskedValue, className }: OwnerIdentityRevealProps) {
  const { hasPermission } = useAuth();
  const canReveal = hasPermission('owners:reveal_identity');
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [showReal, setShowReal] = useState(false);
  const [failed, setFailed] = useState(false);

  const mutation = useMutation({
    mutationFn: () => apiClient.post<{ identityNumber: string }>(`/owners/${ownerId}/reveal-identity`),
    onSuccess: (res) => {
      setFailed(false);
      setRevealedValue(res.data.identityNumber);
      setShowReal(true);
    },
    onError: () => setFailed(true),
  });

  if (!canReveal || !maskedValue.includes('*')) {
    return <LtrText className={className}>{maskedValue}</LtrText>;
  }

  const displayValue = showReal && revealedValue ? revealedValue : maskedValue;

  return (
    <span className={`inline-flex flex-col ${className ?? ''}`}>
      <button
        type="button"
        data-testid="owner-identity-reveal-toggle"
        onClick={() => {
          // Only hits the API once — after that, toggling is purely local
          // (no repeat audit entries for the same person re-hiding/
          // re-showing the same value in one sitting).
          if (revealedValue !== null) {
            setShowReal((s) => !s);
            return;
          }
          mutation.mutate();
        }}
        disabled={mutation.isPending}
        className="inline-flex items-center gap-1 hover:opacity-75 disabled:opacity-50"
        title={showReal ? 'إخفاء الرقم' : 'إظهار الرقم الكامل'}
      >
        <LtrText>{displayValue}</LtrText>
        <EyeIcon open={showReal} size={13} />
      </button>
      {failed && <span className="mt-0.5 text-[10.5px] text-danger">تعذر إظهار الرقم — حاول مرة أخرى.</span>}
    </span>
  );
}
