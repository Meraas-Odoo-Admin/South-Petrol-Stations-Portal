import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { arabicCount } from '@fuel-tracking/shared-types';
import { apiClient } from '../lib/apiClient';
import { Icon, ICONS } from './icons';

// The bell (phase 5B, section 2): every signed-in user has one in the header.
// In-app only, polled every 60 seconds. The list is newest first, each row a
// short title, one line of detail, the time and the place it is about.
// «جديد» is written on every unread row, so unread is never told by weight or
// colour alone.

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  // Identical events collapsed into this row.
  count?: number;
}
interface NotificationList {
  unreadCount: number;
  items: NotificationItem[];
}

const RELATIVE = new Intl.RelativeTimeFormat('ar-u-nu-latn', { numeric: 'auto' });
const ABSOLUTE = new Intl.DateTimeFormat('ar-u-nu-latn', {
  timeZone: 'Africa/Tripoli',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'الآن';
  if (abs < 3600) return RELATIVE.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return RELATIVE.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86_400) return RELATIVE.format(Math.round(seconds / 86_400), 'day');
  return ABSOLUTE.format(new Date(iso));
}

const PANEL_WIDTH = 400;
const EDGE = 12;
const PHONE_BREAKPOINT = 1024;

// Where the desktop panel goes: under the bell, towards the page interior, and
// always inside the viewport. The bell sits at the far left of the page in RTL,
// so the panel opens rightwards from its left edge; if the bell is in the right
// half it opens leftwards from its right edge. Clamped either way, so it can
// never run off a screen edge (it used to overflow the left edge).
export function panelPlacement(
  rect: { left: number; right: number; bottom: number },
  viewport: { width: number; height: number },
): { left: number; top: number; width: number; maxHeight: number } {
  const width = Math.min(PANEL_WIDTH, viewport.width - EDGE * 2);
  const bellInLeftHalf = rect.left + (rect.right - rect.left) / 2 < viewport.width / 2;
  const wanted = bellInLeftHalf ? rect.left : rect.right - width;
  const left = Math.max(EDGE, Math.min(wanted, viewport.width - EDGE - width));
  const top = rect.bottom + 8;
  return { left, top, width, maxHeight: Math.max(240, viewport.height - top - EDGE) };
}

export function NotificationBell({ align = 'end' }: { align?: 'start' | 'end' }) {
  void align; // placement is computed from the bell's position now
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<ReturnType<typeof panelPlacement> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await apiClient.get<NotificationList>('/notifications', { params: { limit: 30 } })).data,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const markOne = useMutation({
    mutationFn: async (id: string) => apiClient.post(`/notifications/${id}/read`),
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: async () => apiClient.post('/notifications/read-all'),
    onSuccess: refresh,
  });

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      if (window.innerWidth >= PHONE_BREAKPOINT && buttonRef.current) {
        setPlacement(panelPlacement(buttonRef.current.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }));
      } else {
        setPlacement(null); // phone: a full-width sheet, styled by class
      }
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = query.data?.unreadCount ?? 0;
  const items = query.data?.items ?? [];

  function openItem(item: NotificationItem) {
    if (!item.readAt) markOne.mutate(item.id);
    setOpen(false);
    if (item.link) navigate(item.link);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        data-testid="notification-bell"
        aria-label={unread > 0 ? `الإشعارات: ${unread} غير مقروءة` : 'الإشعارات'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Icon d={ICONS.bell} size={22} />
        {unread > 0 && (
          <span
            data-testid="notification-count"
            className="absolute -end-0.5 -top-0.5 flex min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[13px] lg:text-[12px] font-extrabold leading-5 text-ink"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink/30 lg:hidden"
        />
        <div
          role="dialog"
          aria-label="الإشعارات"
          data-testid="notification-panel"
          style={placement ?? undefined}
          className={`fixed z-50 flex flex-col overflow-hidden bg-surface shadow-lg ${
            placement
              ? 'rounded-md'
              : 'inset-x-0 bottom-0 max-h-[80vh] rounded-t-lg pb-[env(safe-area-inset-bottom)]'
          }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-[18px] font-extrabold text-ink lg:text-[15px]">الإشعارات</h2>
            <button
              type="button"
              data-testid="notification-read-all"
              disabled={unread === 0 || markAll.isPending}
              onClick={() => markAll.mutate()}
              className="min-h-[44px] rounded-full px-3 text-[15px] font-bold text-primary hover:bg-primary-100 disabled:text-ink-soft disabled:hover:bg-transparent lg:text-[13px]"
            >
              تعليم الكل كمقروء
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {query.isLoading && <p className="p-5 text-center text-[15px] text-ink-soft lg:text-[13px]">جارٍ التحميل…</p>}
            {query.isError && (
              <p role="alert" className="p-5 text-center text-[15px] font-bold text-danger-dark lg:text-[13px]">
                تعذّر تحميل الإشعارات. سنحاول مرة أخرى بعد قليل.
              </p>
            )}
            {query.data && items.length === 0 && (
              <p className="p-6 text-center text-[16px] text-ink-soft lg:text-[14px]">لا توجد إشعارات حتى الآن.</p>
            )}
            <ul className="divide-y divide-line">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid="notification-item"
                    onClick={() => openItem(item)}
                    className={`block w-full px-4 py-3 text-start hover:bg-surface-alt focus-visible:bg-surface-alt focus-visible:outline-none ${
                      item.readAt ? '' : 'bg-accent-100/40'
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      {!item.readAt && (
                        <span className="mt-0.5 shrink-0 rounded-full bg-accent px-2 py-0.5 text-[13px] lg:text-[12px] font-extrabold text-ink">
                          جديد
                        </span>
                      )}
                      <span className="text-[16px] font-bold leading-snug text-ink lg:text-[14px]">{item.title}</span>
                      {(item.count ?? 1) > 1 && (
                        <span className="shrink-0 rounded-full bg-surface-alt px-2 text-[14px] font-bold text-ink-soft lg:text-[12px]">
                          تكرّر {arabicCount(item.count ?? 1, 'time')}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-[15px] leading-[1.7] text-ink-soft lg:text-[13px]">{item.body}</span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-[14px] text-ink-soft lg:text-[12px]">
                      <span>{timeAgo(item.createdAt)}</span>
                      {item.link && <span className="font-bold text-primary">فتح</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
