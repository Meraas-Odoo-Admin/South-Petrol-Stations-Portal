import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../features/auth/AuthProvider';
import { LtrText } from './LtrText';

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
export function OwnerIdentityReveal({ ownerId, maskedValue, className }: OwnerIdentityRevealProps) {
  const { hasPermission } = useAuth();
  const canReveal = hasPermission('owners:reveal_identity');
  const [revealed, setRevealed] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => apiClient.post<{ identityNumber: string }>(`/owners/${ownerId}/reveal-identity`),
    onSuccess: (res) => setRevealed(res.data.identityNumber),
  });

  if (!canReveal) {
    return <LtrText className={className}>{maskedValue}</LtrText>;
  }

  if (revealed !== null) {
    return <LtrText className={className}>{revealed}</LtrText>;
  }

  return (
    <button
      type="button"
      data-testid="owner-identity-reveal-toggle"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className={`inline-flex items-center gap-1 hover:opacity-75 ${className ?? ''}`}
      title="إظهار الرقم الكامل"
    >
      <LtrText>{maskedValue}</LtrText>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  );
}
