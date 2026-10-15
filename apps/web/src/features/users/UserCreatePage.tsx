import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { checkLibyanMobile } from '@fuel-tracking/shared-types';
import { isAxiosError } from 'axios';
import { PageHeader } from '../../components/design/PageHeader';
import { PillButton } from '../../components/design/PillButton';
import { TextField } from '../../components/design/TextField';
import { Icon, ICONS } from '../../components/icons';
import { roleDescription, roleLabel } from '../../lib/labels';
import { adminErrorMessage } from '../admin/adminErrors';
import { JobPicker } from './JobPicker';
import { PlacePicker } from './PlacePicker';
import { TemporaryPasswordPanel } from './TemporaryPasswordPanel';
import { Notice, SectionCard } from './parts';
import { useCreateUser, usePlaceOptions, useUserOptions } from './useUsers';
import type { CreatedUser, JobOption, PlaceKind } from './types';
import { SkeletonRows } from '../../components/design/Skeleton';
import { focusFirstInvalid } from '../../lib/focusField';

const placeKindOf = (job: JobOption): PlaceKind => job.placeKind ?? (job.municipalityScoped ? 'MUNICIPALITY' : job.kind);

const PLACE_NOUN: Record<'PETROL_STATION' | 'REGISTRATION' | 'MUNICIPALITY', { noun: string; label: string }> = {
  PETROL_STATION: { noun: 'محطة', label: 'ابحث عن محطة' },
  REGISTRATION: { noun: 'مكتب', label: 'ابحث عن مكتب تسجيل' },
  MUNICIPALITY: { noun: 'بلدية', label: 'ابحث عن بلدية' },
};

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,60}$/;

interface FieldErrors {
  fullName?: string;
  username?: string;
  phone?: string;
  job?: string;
  places?: string;
}

// New account in one page, three steps in the order an admin thinks: who,
// what job, where. The system makes the temporary password, so nobody types
// one; it is shown once on the next screen.
//
// Phase 5A: people are created from inside the place they belong to, so the
// page takes presets from the link that opened it:
//   ?kind=PETROL_STATION|REGISTRATION|MUNICIPALITY  only jobs that work there
//   ?place=<id>&placeName=<name>                   the place is fixed, not asked
//   ?back=<path>                                   where cancel / done return to
export function UserCreatePage({ basePath, standalone = false }: { basePath: string; standalone?: boolean }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetKind = searchParams.get('kind') as PlaceKind | null;
  const presetPlace = searchParams.get('place');
  const presetPlaceName = searchParams.get('placeName');
  const backPath = searchParams.get('back') || basePath;
  const options = useUserOptions();
  const create = useCreateUser();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [placeIds, setPlaceIds] = useState<string[]>(presetPlace ? [presetPlace] : []);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<CreatedUser | null>(null);

  const allJobs = options.data?.jobs ?? [];
  const jobs = presetKind ? allJobs.filter((j) => placeKindOf(j) === presetKind) : allJobs;
  // A supervisor can only give one job: it is shown, not asked.
  const fixedJob = jobs.length === 1 ? jobs[0] : null;
  useEffect(() => {
    if (fixedJob && jobId !== fixedJob.id) setJobId(fixedJob.id);
  }, [fixedJob, jobId]);

  const selected = jobs.find((j) => j.id === jobId) ?? null;
  const kind: PlaceKind = selected ? placeKindOf(selected) : null;
  const places = usePlaceOptions(presetPlace ? null : kind);

  function pickJob(id: string) {
    const next = jobs.find((j) => j.id === id);
    if (!presetPlace && (next ? placeKindOf(next) : null) !== kind) setPlaceIds([]);
    setJobId(id);
    setErrors((e) => ({ ...e, job: undefined, places: undefined }));
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (fullName.trim().length < 2) found.fullName = 'اكتب الاسم الكامل (حرفان على الأقل).';
    if (!USERNAME_PATTERN.test(username.trim())) {
      found.username = 'اسم المستخدم بحروف إنجليزية وأرقام فقط، ثلاثة أحرف على الأقل، دون مسافات.';
    }
    const phoneCheck = checkLibyanMobile(phone);
    if (!phoneCheck.ok) found.phone = phoneCheck.message;
    if (!selected) found.job = 'اختر وظيفة الشخص.';
    else if (kind && placeIds.length === 0) found.places = 'اختر مكان عمل واحدًا على الأقل.';
    else if (kind === 'MUNICIPALITY' && placeIds.length !== 1) found.places = 'اختر بلدية واحدة فقط.';
    return found;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return focusFirstInvalid();
    if (!selected) return;
    create.mutate(
      {
        username: username.trim(),
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        roleId: selected.id,
        placeIds: kind ? placeIds : [],
      },
      {
        onSuccess: setCreated,
        onError: (error) => {
          if (isAxiosError(error) && error.response?.status === 409) {
            setErrors({ username: 'اسم المستخدم هذا مستخدم مسبقًا، اختر اسمًا آخر.' });
          }
        },
      },
    );
  }

  function again() {
    setCreated(null);
    setFullName('');
    setUsername('');
    setPhone('');
    setPlaceIds(presetPlace ? [presetPlace] : []);
    setErrors({});
    create.reset();
    if (!fixedJob) setJobId(null);
  }

  const header = standalone ? (
    <PageHeader title="حساب جديد" subtitle={presetPlaceName ? `في ${presetPlaceName}` : 'موظف جديد في محطتك أو مكتبك'} />
  ) : (
    <div>
      <h1 className="text-[24px] font-extrabold text-ink lg:text-xl">حساب جديد</h1>
      {presetPlaceName && <p className="mt-1 text-[16px] text-ink-soft lg:text-[14px]">في {presetPlaceName}</p>}
    </div>
  );

  if (created) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {header}
        <SectionCard title="تم إنشاء الحساب">
          <div className="space-y-4">
            <Notice kind="success">
              أُنشئ حساب {created.fullName}. سلّمه كلمة المرور المؤقتة أدناه؛ لن تظهر مرة أخرى.
            </Notice>
            <p className="text-[16px] lg:text-[14px]">
              اسم المستخدم:{' '}
              <span dir="ltr" className="font-mono font-bold">
                {created.username}
              </span>
            </p>
            {created.temporaryPassword && <TemporaryPasswordPanel password={created.temporaryPassword} who={created.fullName} />}
            <div className="flex flex-col gap-2.5 lg:flex-row">
              <PillButton size="field" onClick={() => navigate(`${basePath}/${created.id}?back=${encodeURIComponent(backPath)}`)}>
                فتح صفحة الشخص
              </PillButton>
              <PillButton size="field" variant="secondary" onClick={again}>
                إضافة حساب آخر
              </PillButton>
              <PillButton size="field" variant="ghost" onClick={() => navigate(backPath)}>
                العودة إلى القائمة
              </PillButton>
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-3xl space-y-4">
      <Link
        to={backPath}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full pe-3 text-[16px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark focus-visible:ring-offset-2 lg:text-[14px]"
      >
        <Icon d={ICONS.arrowBack} size={18} />
        العودة إلى القائمة
      </Link>
      {header}

      <SectionCard step={1} title="من هو؟">
        <div className="space-y-4">
          <TextField
            label="الاسم الكامل"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            error={errors.fullName}
            autoComplete="off"
          />
          <TextField
            label="اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={errors.username}
            hint="يدخل به إلى المنظومة ولا يتغيّر بعد الإنشاء. مثال: ahmed.ali"
            ltr
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <TextField
            label="الهاتف (اختياري)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors.phone}
            hint="رقم ليبي من 10 أرقام يبدأ بـ 091 إلى 096، ويُقبل +218."
            ltr
            inputMode="tel"
            autoComplete="off"
          />
        </div>
      </SectionCard>

      <SectionCard step={2} title="ما وظيفته؟" description="لكل شخص وظيفة واحدة.">
        {options.isLoading && <SkeletonRows rows={3} label="جارٍ تحميل الوظائف" />}
        {options.isError && <Notice kind="error">تعذّر تحميل الوظائف. أعد تحميل الصفحة.</Notice>}
        {fixedJob ? (
          <div className="rounded-md border-2 border-primary bg-primary-100 p-4">
            <p className="text-[17px] font-extrabold text-ink lg:text-[15px]">{roleLabel(fixedJob.name)}</p>
            <p className="mt-1 text-[15px] text-ink-soft lg:text-[13px]">{roleDescription(fixedJob.name, fixedJob.description)}</p>
            <p className="mt-2 text-[14px] text-ink-soft lg:text-[12px]">يمكنك إنشاء حسابات هذه الوظيفة فقط.</p>
          </div>
        ) : (
          options.data && <JobPicker jobs={jobs} value={jobId} onChange={pickJob} name="new-job" />
        )}
        {errors.job && (
          <div className="mt-3">
            <Notice kind="error">{errors.job}</Notice>
          </div>
        )}
      </SectionCard>

      <SectionCard
        step={3}
        title="أين يعمل؟"
        description={selected ? undefined : 'اختر الوظيفة أولًا وسيظهر هنا ما يناسبها.'}
      >
        {presetPlace ? (
          <div className="rounded-md bg-surface-alt p-4 text-[17px] font-extrabold text-ink lg:text-[15px]">
            {presetPlaceName ?? 'المكان المحدّد'}
          </div>
        ) : selected && kind ? (
          <PlacePicker
            noun={PLACE_NOUN[kind].noun}
            searchLabel={PLACE_NOUN[kind].label}
            single={kind === 'MUNICIPALITY'}
            options={places.options}
            loading={places.isLoading}
            selected={placeIds}
            onChange={(ids) => {
              setPlaceIds(ids);
              setErrors((e) => ({ ...e, places: undefined }));
            }}
          />
        ) : selected ? (
          <Notice kind="info">هذه الوظيفة ترى كل البلديات والمحطات والمكاتب، فلا حاجة لتحديد مكان عمل.</Notice>
        ) : null}
        {errors.places && (
          <div className="mt-3">
            <Notice kind="error">{errors.places}</Notice>
          </div>
        )}
      </SectionCard>

      {create.isError && !errors.username && (
        <Notice kind="error">{adminErrorMessage(create.error, 'تعذّر إنشاء الحساب. تحقق من البيانات وحاول مجددًا.')}</Notice>
      )}

      <div className="flex flex-col gap-2.5 lg:flex-row">
        <PillButton type="submit" size="field" disabled={create.isPending}>
          {create.isPending ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
        </PillButton>
        <PillButton type="button" size="field" variant="ghost" onClick={() => navigate(backPath)}>
          إلغاء
        </PillButton>
      </div>
    </form>
  );
}
