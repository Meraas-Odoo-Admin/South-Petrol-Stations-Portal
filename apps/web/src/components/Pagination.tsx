interface PaginationProps {
  skip: number;
  take: number;
  total: number;
  onSkipChange: (skip: number) => void;
}

export function Pagination({ skip, take, total, onSkipChange }: PaginationProps) {
  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(skip + take, total);

  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
      <span>
        {from}-{to} من {total}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={skip === 0}
          onClick={() => onSkipChange(Math.max(0, skip - take))}
          className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
        >
          السابق
        </button>
        <button
          type="button"
          disabled={skip + take >= total}
          onClick={() => onSkipChange(skip + take)}
          className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
        >
          التالي
        </button>
      </div>
    </div>
  );
}
