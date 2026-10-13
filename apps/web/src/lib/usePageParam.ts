import { useSearchParams } from 'react-router-dom';

// The page of a list lives in the address (?page=2), so a refresh and the back
// button land on the same page. Page numbers are 1-based in the address and
// the hook hands back the `skip` the API wants. Changing a filter calls
// `reset()` to go back to the first page.
//
// Writing the page NAVIGATES (it changes the address), so it must never be done
// when nothing changes: a "reset to page 1" fired by a timer on a list that is
// already on page 1 once navigated back to the list over the route the person
// had just left for (the phone e2e flake). Moving to the page already shown is
// a no-op, and a reset replaces the history entry instead of adding one.
export function usePageParam(take: number, param = 'page'): {
  skip: number;
  page: number;
  setSkip: (skip: number) => void;
  reset: () => void;
} {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get(param));
  const page = Number.isInteger(raw) && raw >= 1 ? raw : 1;

  const write = (nextPage: number, replace: boolean) => {
    if (nextPage === page) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextPage <= 1) next.delete(param);
        else next.set(param, String(nextPage));
        return next;
      },
      { replace },
    );
  };

  return {
    skip: (page - 1) * take,
    page,
    setSkip: (skip) => write(Math.floor(skip / take) + 1, false),
    reset: () => write(1, true),
  };
}
