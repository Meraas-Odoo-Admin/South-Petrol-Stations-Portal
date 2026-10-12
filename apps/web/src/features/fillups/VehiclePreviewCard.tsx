import { VEHICLE_FUEL_TYPE_LABELS_AR } from '@fuel-tracking/shared-types';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiClient } from '../../lib/apiClient';
import { identityTypeLabel } from '../../lib/labels';
import { maskIdentityNumber } from '../../lib/masking';
import { OwnerIdentityReveal } from '../../components/OwnerIdentityReveal';
import { useAuth } from '../auth/AuthProvider';
import type { VehicleBasicInfo } from '../vehicles/types';

// Round 4 feedback, item 3: "genuinely new UI, not a bug fix" — once a
// vehicle is picked, staff should see enough of its identity inline to
// visually confirm it's the right one before submitting, without leaving
// this page. Surfaces the same fields VehicleDetailPage's identity card
// already shows (make/model, usage type, owner). Round 6: the "current
// driver" field was removed along with the rest of the Driver management
// surface — the owner's identity number is what matters now (see
// docs/DESIGN_owner_based_fillups.md). Round 7: the owner's masked
// identity number gets the same reveal-toggle treatment used everywhere
// else it's displayed.
// idSuffix: RecordFillUpPage renders the mobile wizard and the desktop
// single-page form as CSS-hidden siblings sharing one react-hook-form
// state, not two mutually-exclusive mounts — both instantiate this
// component once a vehicle is selected, regardless of which layout the
// viewport actually shows (found via round 8's e2e run: a bare
// data-testid resolved to two elements, one per layout, exactly the same
// "hidden but still mounted" class of bug Layout.tsx's own history
// comment already documents for the old double-<Outlet/> issue).
export function VehiclePreviewCard({ vehicleId, idSuffix = '' }: { vehicleId: string; idSuffix?: string }) {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['vehicles', vehicleId, 'preview'],
    queryFn: async () => (await apiClient.get<VehicleBasicInfo>(`/vehicles/${vehicleId}`)).data,
    enabled: !!vehicleId,
  });

  if (isLoading || !data) return null;

  return (
    <div className="mt-2.5 rounded-sm bg-surface-alt p-3 text-[12px]" data-testid={`vehicle-preview-card${idSuffix}`}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <PreviewField label="المركبة" value={[data.make, data.model].filter(Boolean).join(' ') || '—'} />
        <PreviewField label="نوع الوقود" value={data.fuelType ? VEHICLE_FUEL_TYPE_LABELS_AR[data.fuelType] : '—'} />
        <PreviewField label="نوع المركبة" value={data.vehicleType?.name ?? '—'} />
      </div>

      {/* Owner gets its own labeled block (name / identity type / identity
          number each on their own line) rather than crammed into one grid
          cell alongside brand/usage type — that packed shape read as a
          rendering mistake, not a deliberate summary. */}
      <div className="mt-3 border-t border-line/60 pt-2.5">
        <p className="mb-1.5 text-[11px] font-bold text-ink-faint">بيانات المالك</p>
        {data.owner ? (
          <div className="space-y-1">
            <PreviewField label="الاسم" value={data.owner.fullName} />
            <PreviewField label="نوع الهوية" value={identityTypeLabel(data.owner.identityType)} />
            <PreviewField
              label="رقم الهوية"
              value={
                <OwnerIdentityReveal
                  ownerId={data.owner.id}
                  maskedValue={maskIdentityNumber(data.owner.identityNumber, permissions)}
                />
              }
            />
          </div>
        ) : (
          <p className="font-bold text-ink">—</p>
        )}
      </div>
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <span className="text-ink-faint">{label}: </span>
      <span className="font-bold text-ink">{value}</span>
    </div>
  );
}
