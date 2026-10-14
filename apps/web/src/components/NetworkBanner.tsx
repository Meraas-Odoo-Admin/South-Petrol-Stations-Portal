import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// One calm banner when the server cannot be reached (Phase 6, B3): what
// happened, that nothing was saved, and a retry. It listens for the API
// client's transport failures and the browser's own offline state, and
// disappears by itself on the next successful request.
export function NetworkBanner() {
  const queryClient = useQueryClient();
  const [down, setDown] = useState(false);
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);

  useEffect(() => {
    const onApi = (event: Event) => setDown(Boolean((event as CustomEvent<{ down: boolean }>).detail?.down));
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('api:network', onApi);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('api:network', onApi);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!down && !offline) return null;
  return (
    <div
      role="alert"
      data-testid="network-banner"
      className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-accent-100 px-4 py-3 text-[15px] font-bold text-ink lg:text-[13px]"
    >
      <span>{offline ? 'لا يوجد اتصال بالإنترنت. لم يُحفظ شيء. ستعمل الصفحة من جديد عند عودة الاتصال.' : 'تعذّر الاتصال بالخادم. تحقّق من الشبكة. لم يُحفظ شيء.'}</span>
      <button
        type="button"
        className="min-h-[44px] rounded-full bg-primary px-5 text-[15px] font-bold text-white lg:text-[13px]"
        onClick={() => {
          setDown(false);
          void queryClient.invalidateQueries();
        }}
      >
        إعادة المحاولة
      </button>
    </div>
  );
}
