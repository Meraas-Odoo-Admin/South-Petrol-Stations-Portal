import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { Icon, ICONS } from './icons';
import { PillButton } from './design/PillButton';
import { BrandMark } from './BrandMark';

interface TourStep {
  icon: keyof typeof ICONS;
  title: string;
  body: string;
  to?: string;
  ctaLabel?: string;
}

function storageKey(userId: string): string {
  return `onboarding-tour-seen:${userId}`;
}

const REPLAY_EVENT = 'onboarding-tour:replay';

// HomePage's "إعادة الجولة التعريفية" quick-link calls this — clears the
// "seen" flag and asks the mounted OnboardingTour (in Layout.tsx, so it
// stays mounted across navigation) to show itself again immediately,
// rather than only ever re-arming for some future login.
export function replayOnboardingTour(userId: string): void {
  localStorage.removeItem(storageKey(userId));
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

// Round 19: "I want the system to give the user an onboarding tour once
// he entered the system to show them how to use the system." A short,
// permission-aware modal walkthrough (not a live-element spotlight —
// deliberately: the mobile nav is collapsed behind a hamburger sheet most
// of the time, so pointing at a hidden element would be unreliable; a
// centered step sequence works identically at every width) shown once per
// user (tracked in localStorage by user id, not username — usernames
// could change, ids don't) right after their first successful login.
// Re-runnable any time via the "جولة تعريفية" quick-link this same round
// added to HomePage.tsx, for a user who skipped it or wants a refresher.
export function OnboardingTour() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    const seen = localStorage.getItem(storageKey(user.id));
    if (!seen) setVisible(true);
  }, [user]);

  useEffect(() => {
    function onReplay() {
      setStep(0);
      setVisible(true);
    }
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  const steps = useMemo<TourStep[]>(() => {
    if (!user) return [];
    const list: TourStep[] = [
      {
        icon: 'home',
        title: `أهلًا بك، ${user.fullName}`,
        body: 'هذه جولة سريعة على أهم أجزاء نظام ضبط الوقود. يمكنك تخطّيها في أي وقت، وإعادتها لاحقًا من الصفحة الرئيسية.',
      },
    ];
    if (hasPermission('fillups:create')) {
      list.push({
        icon: 'fillup',
        title: 'تسجيل تعبئة',
        body: 'من هنا تُسجَّل كل عملية تعبئة وقود — أدخل رقم اللوحة أو امسح رمز المركبة، ثم اتبع خطوات المعالج حتى النهاية.',
        to: '/fillups/new',
        ctaLabel: 'فتح تسجيل التعبئة',
      });
    }
    if (hasPermission('vehicles:read')) {
      list.push({
        icon: 'vehicles',
        title: 'المركبات',
        body: 'تصفح كل المركبات المسجَّلة، ابحث برقم اللوحة أو الشاسيه أو اسم المالك، وأضف مركبات جديدة مع بيانات مالكها.',
        to: '/vehicles',
        ctaLabel: 'فتح المركبات',
      });
    }
    if (hasPermission('stations:read')) {
      list.push({
        icon: 'stations',
        title: 'المحطات',
        body: hasPermission('stations:manage')
          ? 'استعرض كل محطات المديرية، وأضِف أو عدِّل بيانات أي محطة مباشرة من هذه الصفحة.'
          : 'استعرض محطات المديرية وحالتها ونوع الوقود المتوفر في كل واحدة.',
        to: '/stations',
        ctaLabel: 'فتح المحطات',
      });
    }
    if (hasPermission('reports:view')) {
      list.push({
        icon: 'reports',
        title: 'التقارير والمخالفات',
        body: 'التقرير اليومي يلخِّص تعبئات أي يوم، وقائمة «المخالفات والاستثناءات» تجمع كل الحالات التي تحتاج قرارك.',
        to: '/reports/daily',
        ctaLabel: 'فتح التقارير',
      });
    }
    if (hasPermission('reports:view_all_stations')) {
      list.push({
        icon: 'dashboard',
        title: 'لوحة المتابعة',
        body: 'نظرة عامة على أداء كل محطات المديرية معًا — إجمالي التعبئات ونسبة المخالفات لكل محطة.',
        to: '/reports/dashboard',
        ctaLabel: 'فتح لوحة المتابعة',
      });
    }
    if (hasPermission('users:manage')) {
      list.push({
        icon: 'admin',
        title: 'الإدارة',
        body: 'إدارة الحسابات والصلاحيات، وإعدادات المنظومة القابلة للتعديل (كحد التعبئات الأسبوعي)، وسجل التغييرات.',
        to: '/admin',
        ctaLabel: 'فتح الإدارة',
      });
    }
    return list;
  }, [user, hasPermission]);

  function finish() {
    if (user) localStorage.setItem(storageKey(user.id), '1');
    setVisible(false);
    setStep(0);
  }

  if (!visible || steps.length === 0) return null;
  const current = steps[step]!;
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-ink/40 p-4" data-testid="onboarding-tour">
      <div className="w-full max-w-sm animate-scale-in overflow-hidden rounded-lg bg-surface shadow-lg">
        <div className="flex flex-col items-center gap-2 bg-gradient-to-br from-primary to-primary-dark px-6 py-6 text-center text-white">
          <BrandMark variant="white" />
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15">
            <Icon d={ICONS[current.icon]} size={20} />
          </span>
        </div>
        <div className="p-5">
          <h2 className="text-[16px] font-extrabold text-ink">{current.title}</h2>
          <p className="mt-2 text-[13px] lg:text-[12.5px] leading-[1.8] text-ink-soft">{current.body}</p>

          <div className="mt-4 flex items-center justify-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-primary' : 'w-1.5 bg-surface-alt'}`}
              />
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-2">
            {current.to && (
              <PillButton
                variant="secondary"
                onClick={() => {
                  navigate(current.to!);
                  finish();
                }}
              >
                {current.ctaLabel}
              </PillButton>
            )}
            <div className="flex items-center gap-2">
              {step > 0 && (
                <PillButton variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                  السابق
                </PillButton>
              )}
              <PillButton className="flex-1 justify-center" onClick={() => (isLast ? finish() : setStep((s) => s + 1))}>
                {isLast ? 'إنهاء' : 'التالي'}
              </PillButton>
            </div>
            {!isLast && (
              <button type="button" onClick={finish} className="text-[13px] lg:text-[12px] font-bold text-ink-faint hover:text-ink-soft">
                تخطّي الجولة
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
