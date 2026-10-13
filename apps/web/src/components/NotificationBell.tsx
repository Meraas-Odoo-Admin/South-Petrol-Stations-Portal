import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
}
interface NotificationList {
  unreadCount: number;
  items: NotificationItem[];
}

const RELATIVE = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
const ABSOLUTE = new Intl.DateTimeFormat('ar-LY', {
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

export function NotificationBell({ align = 'end' }: { align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
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
            className="absolute -end-0.5 -top-0.5 flex min-w-[20px] items-center justify-center rounded-full bg-accent-dark px-1 text-[12px] font-extrabold leading-5 text-white"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="الإشعارات"
          data-testid="notification-panel"
          className={`fixed inset-x-3 top-16 z-50 max-h-[75vh] overflow-hidden rounded-md bg-surface shadow-lg lg:absolute lg:inset-x-auto lg:top-12 lg:w-[400px] ${
            align === 'end' ? 'lg:end-0' : 'lg:start-0'
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

          <div className="max-h-[calc(75vh-64px)] overflow-y-auto">
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
                        <span className="mt-0.5 shrink-0 rounded-full bg-accent-dark px-2 py-0.5 text-[12px] font-extrabold text-white">
                          جديد
                        </span>
                      )}
                      <span className="text-[16px] font-bold leading-snug text-ink lg:text-[14px]">{item.title}</span>
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
      )}
    </div>
  );
}
