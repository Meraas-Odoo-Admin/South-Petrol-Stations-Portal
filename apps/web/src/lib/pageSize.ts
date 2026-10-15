import { useEffect } from 'react';
import { usePageParam } from './usePageParam';

// How many rows a list shows on one page — EVERY list, table and row set in
// the app (Phase 7, after review: 10, it was 20–50 depending on the screen).
// Change it here, nowhere else.
export const LIST_PAGE_SIZE = 10;

// For a list whose rows are already all on the screen (a short lookup list, a
// per-station summary): the same pager as the server-paged lists, the page in
// the address (?page=, or `param` when a screen holds two lists), and only the
// current page's rows drawn.
export function useClientPage<T>(items: readonly T[], param = 'page') {
  const { skip, setSkip, reset } = usePageParam(LIST_PAGE_SIZE, param);
  const total = items.length;
  // A filter that shrinks the list never leaves the person on an empty page.
  useEffect(() => {
    if (skip > 0 && skip >= total) reset();
  }, [skip, total, reset]);
  return {
    pageItems: items.slice(skip, skip + LIST_PAGE_SIZE),
    skip,
    setSkip,
    total,
    take: LIST_PAGE_SIZE,
  };
}
