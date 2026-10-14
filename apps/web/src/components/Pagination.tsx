import { Icon, ICONS } from './icons';

// The one pager for every list (UX round): «1–20 من 340», the page number, and
// two 44px buttons. A list asks the server for one page and is given the total;
// nothing here ever holds more rows than a page. It renders nothing when the
// whole list fits on one page and there is nothing to say.
interface PaginationProps {
  skip: number;
  take: number;
  total: number;
  onSkipChange: (skip: number) => void;
  /** Always show the «1–20 من 340» line, even for a single page. */
  alwaysShow?: boolean;
  testId?: string;
}

const nf = new Intl.NumberFormat('en-US');

export function Pagination({ skip, take, total, onSkipChange, alwaysShow = false, testId = 'pager' }: PaginationProps) {
  if (total <= take && !alwaysShow) return null;
  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(skip + take, total);
  const pages = Math.max(1, Math.ceil(total / take));
  const page = Math.min(pages, Math.floor(skip / take) + 1);

  return (
    <nav
      aria-label="التنقل بين الصفحات"
      data-testid={testId}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-3 lg:px-[18px]"
    >
      <p className="text-[15px] text-ink-soft lg:text-[13px]" role="status">
        <span data-testid={`${testId}-range`}>
          <bdi dir="ltr">
            {nf.format(from)}–{nf.format(to)}
          </bdi>{' '}
          من <bdi dir="ltr">{nf.format(total)}</bdi>
        </span>
        {pages > 1 && (
          <span className="ms-3 text-ink-faint">
            صفحة <bdi dir="ltr">{page}</bdi> من <bdi dir="ltr">{pages}</bdi>
          </span>
        )}
      </p>
      {pages > 1 && (
        <div className="flex gap-2">
          <button
            type="button"
            data-testid={`${testId}-prev`}
            disabled={skip === 0}
            onClick={() => onSkipChange(Math.max(0, skip - take))}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-surface-alt px-4 text-[15px] font-bold text-ink-soft hover:bg-primary-100 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:hover:bg-surface-alt disabled:hover:text-ink-soft lg:min-h-[36px] lg:text-[13px]"
          >
            <Icon d={ICONS.arrowBack} size={16} />
            السابق
          </button>
          <button
            type="button"
            data-testid={`${testId}-next`}
            disabled={skip + take >= total}
            onClick={() => onSkipChange(skip + take)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-surface-alt px-4 text-[15px] font-bold text-ink-soft hover:bg-primary-100 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:hover:bg-surface-alt disabled:hover:text-ink-soft lg:min-h-[36px] lg:text-[13px]"
          >
            التالي
            <Icon d={ICONS.arrowNext} size={16} />
          </button>
        </div>
      )}
    </nav>
  );
}
