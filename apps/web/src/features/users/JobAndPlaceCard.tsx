import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../lib/apiClient';
import { roleDescription, roleLabel } from '../../lib/labels';
import { PillButton } from '../../components/design/PillButton';
import { Dialog } from '../../components/design/Dialog';
import { adminErrorMessage } from '../admin/adminErrors';
import { JobPicker } from './JobPicker';
import { PlacePicker } from './PlacePicker';
import { Notice, SectionCard } from './parts';
import { useAccountMutation, usePlaceOptions } from './useUsers';
import type { PlaceKind, UserDetail } from './types';

const SIDE_NOUN: Record<'PETROL_STATION' | 'REGISTRATION' | 'MUNICIPALITY', { noun: string; label: string; title: string }> = {
  PETROL_STATION: { noun: 'محطة', label: 'ابحث عن محطة', title: 'محطات العمل' },
  REGISTRATION: { noun: 'مكتب', label: 'ابحث عن مكتب تسجيل', title: 'مكاتب العمل' },
  MUNICIPALITY: { noun: 'بلدية', label: 'ابحث عن بلدية', title: 'البلدية' },
};

// What job this person has and where they work. One job, picked from a list
// grouped by side; then only the picker that fits that side. Changing the job
// asks first, because it ends the person's sessions and replaces the old job.
export function JobAndPlaceCard({ user }: { user: UserDetail }) {
  const currentJob = user.roles[0]?.role ?? null;
  const currentKind: PlaceKind = currentJob?.municipalityScoped ? 'MUNICIPALITY' : (currentJob?.kind ?? null);
  const currentPlaceIds = useMemo(() => user.places.map((p) => p.id), [user.places]);

  const [jobId, setJobId] = useState<string | null>(currentJob?.id ?? null);
  const [placeIds, setPlaceIds] = useState<string[]>(currentPlaceIds);
  const [confirmJob, setConfirmJob] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    setJobId(currentJob?.id ?? null);
    setPlaceIds(currentPlaceIds);
  }, [user.id, currentJob?.id, currentPlaceIds]);

  const jobs = user.assignableJobs;
  const selected = jobs.find((j) => j.id === jobId) ?? null;
  // A person's present job may be one this caller cannot give (a top-level
  // job seen by a directorate admin): it is shown, not offered.
  const selectedKind: PlaceKind = selected
    ? (selected.placeKind ?? (selected.municipalityScoped ? 'MUNICIPALITY' : selected.kind))
    : jobId === currentJob?.id
      ? currentKind
      : null;
  const jobChanged = jobId !== (currentJob?.id ?? null);
  const sideChanged = jobChanged && selectedKind !== currentKind;
  const placesChanged =
    placeIds.length !== currentPlaceIds.length || placeIds.some((id) => !currentPlaceIds.includes(id));

  const canChangeJob = user.capabilities.canChangeJob;
  const canSetPlaces = user.capabilities.canSetPlaces;
  const needsPlaces = selectedKind !== null;
  const places = usePlaceOptions(selectedKind);

  const changeJob = useAccountMutation(user.id, async () =>
    (
      await apiClient.put<UserDetail>(`/users/${user.id}/job`, {
        roleId: jobId,
        ...(selectedKind ? { placeIds } : {}),
      })
    ).data,
  );
  const savePlaces = useAccountMutation(user.id, async () =>
    (await apiClient.put<UserDetail>(`/users/${user.id}/places`, { placeIds })).data,
  );

  function pickJob(id: string) {
    setDone(null);
    setJobId(id);
    const next = jobs.find((j) => j.id === id);
    // A different side has different places: start empty and ask.
    const nextKind: PlaceKind = next ? (next.placeKind ?? (next.municipalityScoped ? 'MUNICIPALITY' : next.kind)) : null;
    if (next && nextKind !== currentKind) setPlaceIds([]);
    else setPlaceIds(currentPlaceIds);
  }

  const placesMissing = needsPlaces && placeIds.length === 0;
  const pending = changeJob.isPending || savePlaces.isPending;
  const mutationError = changeJob.error ?? savePlaces.error;

  return (
    <SectionCard
      title="الوظيفة والمكان"
      description="لكل شخص وظيفة واحدة، ومكان العمل يتبع جهة وظيفته."
    >
      <div className="space-y-5">
        {user.roles.length > 1 && (
          <Notice kind="pending">
            لهذا الحساب أكثر من وظيفة (حساب قديم). اختر وظيفة واحدة وسيحلّ اختيارك محلّ الباقي.
          </Notice>
        )}

        {canChangeJob ? (
          <JobPicker jobs={jobs} value={jobId} onChange={pickJob} name={`job-${user.id}`} />
        ) : (
          <div className="rounded-md bg-surface-alt p-4">
            <p className="text-[17px] font-extrabold text-ink lg:text-[15px]">
              {currentJob ? roleLabel(currentJob.name) : 'بلا وظيفة'}
            </p>
            {currentJob && (
              <p className="mt-1 text-[15px] text-ink-soft lg:text-[13px]">
                {roleDescription(currentJob.name, currentJob.description)}
              </p>
            )}
          </div>
        )}

        {needsPlaces ? (
          <div>
            <h3 className="mb-2 text-[16px] font-extrabold text-ink lg:text-[14px]">
              {SIDE_NOUN[selectedKind].title}
            </h3>
            {sideChanged && (
              <div className="mb-3">
                <Notice kind="pending">
                  الوظيفة الجديدة في جهة أخرى، لذلك ستُزال أماكن العمل الحالية. اختر الأماكن الجديدة.
                </Notice>
              </div>
            )}
            <PlacePicker
              noun={SIDE_NOUN[selectedKind].noun}
              searchLabel={SIDE_NOUN[selectedKind].label}
              options={places.options}
              loading={places.isLoading}
              single={selectedKind === 'MUNICIPALITY'}
              selected={placeIds}
              onChange={(ids) => {
                setDone(null);
                setPlaceIds(ids);
              }}
              disabled={!canSetPlaces}
            />
          </div>
        ) : (
          <Notice kind="info">هذه الوظيفة ترى كل البلديات والمحطات والمكاتب، فلا حاجة لتحديد مكان عمل.</Notice>
        )}

        {mutationError && (
          <Notice kind="error">{adminErrorMessage(mutationError, 'تعذّر حفظ التغيير. حاول مجددًا.')}</Notice>
        )}
        {done && <Notice kind="success">{done}</Notice>}
        {placesMissing && (jobChanged || placesChanged) && (
          <Notice kind="pending">اختر مكان عمل واحدًا على الأقل قبل الحفظ.</Notice>
        )}

        {canChangeJob && jobChanged && (
          <PillButton size="field" disabled={placesMissing || pending} onClick={() => setConfirmJob(true)}>
            تغيير الوظيفة
          </PillButton>
        )}
        {!jobChanged && canSetPlaces && needsPlaces && placesChanged && (
          <PillButton
            size="field"
            disabled={placesMissing || pending}
            onClick={() => savePlaces.mutate(undefined as never, { onSuccess: () => setDone('تم حفظ أماكن العمل.') })}
          >
            {savePlaces.isPending ? 'جارٍ الحفظ…' : 'حفظ أماكن العمل'}
          </PillButton>
        )}
      </div>

      <Dialog
        open={confirmJob}
        title="تأكيد تغيير الوظيفة"
        busy={changeJob.isPending}
        onClose={() => setConfirmJob(false)}
        footer={
          <>
            <PillButton size="field" variant="secondary" disabled={changeJob.isPending} onClick={() => setConfirmJob(false)}>
              رجوع
            </PillButton>
            <PillButton
              size="field"
              disabled={changeJob.isPending}
              onClick={() =>
                changeJob.mutate(undefined as never, {
                  onSuccess: () => {
                    setConfirmJob(false);
                    setDone('تم تغيير الوظيفة.');
                  },
                  onError: () => setConfirmJob(false),
                })
              }
            >
              {changeJob.isPending ? 'جارٍ التغيير…' : 'تأكيد التغيير'}
            </PillButton>
          </>
        }
      >
        <p className="leading-[1.8]">
          ستصبح وظيفة {user.fullName} «{selected ? roleLabel(selected.name) : ''}»
          {currentJob ? ` بدلًا من «${roleLabel(currentJob.name)}»` : ''}.
        </p>
        <p className="mt-2 leading-[1.8] text-ink-soft">
          سيُنهى تسجيل دخوله على كل أجهزته وعليه الدخول من جديد.
          {sideChanged ? ' وستُزال أماكن عمله الحالية.' : ''}
        </p>
      </Dialog>
    </SectionCard>
  );
}
