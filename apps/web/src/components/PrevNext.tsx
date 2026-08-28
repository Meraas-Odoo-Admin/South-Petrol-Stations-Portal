interface PrevNextProps {
  skip: number;
  take: number;
  rowCount: number;
  onSkipChange: (skip: number) => void;
}

// For endpoints that return a plain array (no {total, rows} wrapper) —
// GET /vehicles, GET /drivers — so there's no total count to show. "Next"
// is enabled only when a full page came back, since a short page means
// this is the last one.
export function PrevNext({ skip, take, rowCount, onSkipChange }: PrevNextProps) {
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
      <span>
        {rowCount === 0 ? 0 : skip + 1}-{skip + rowCount}
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
          disabled={rowCount < take}
          onClick={() => onSkipChange(skip + take)}
          className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
        >
          التالي
        </button>
      </div>
    </div>
  );
}
