// A loading placeholder in the shape of what is coming (Phase 6, B3): a blank
// screen or a lone «جارٍ التحميل…» tells nobody how much is on its way.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse-soft rounded-sm bg-line-soft ${className}`} />;
}

export function SkeletonRows({ rows = 5, label = 'جارٍ التحميل' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2 p-4" data-testid="skeleton-rows">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
