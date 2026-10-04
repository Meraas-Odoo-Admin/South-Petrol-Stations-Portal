import { useState } from 'react';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../features/auth/AuthProvider';
import { PillButton } from './design/PillButton';

// Phase 4a: the A4 "registration stations" sheet (the municipality's active
// registration stations, the deadline if set, the print date) — for a driver
// who asks where to get a card. Supervisors pass the petrol station they
// work at; admins can pass a municipality. The server checks the scope and
// the registration_sheet:print permission; this only hides the button.
export function PrintRegistrationSheetButton({
  stationId,
  municipalityId,
  className,
}: {
  stationId?: string;
  municipalityId?: string;
  className?: string;
}) {
  const { hasPermission } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!hasPermission('registration_sheet:print') || (!stationId && !municipalityId)) return null;

  async function print() {
    setBusy(true);
    setError(false);
    try {
      const res = await apiClient.get<Blob>('/registration-sheet', {
        params: stationId ? { stationId } : { municipalityId },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const win = window.open(url, '_blank');
      if (!win) {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'registration-stations.pdf';
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={className}>
      <PillButton
        variant="ghost"
        size="sm"
        data-testid="print-registration-sheet"
        disabled={busy}
        onClick={print}
      >
        {busy ? '...جارٍ التحضير' : 'طباعة قائمة مكاتب التسجيل'}
      </PillButton>
      {error && <span className="ms-2 text-[11px] text-danger">تعذرت الطباعة.</span>}
    </span>
  );
}
