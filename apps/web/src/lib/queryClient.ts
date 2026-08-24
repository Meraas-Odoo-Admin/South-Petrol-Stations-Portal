import { QueryClient } from '@tanstack/react-query';

// Stations may have unstable connections (docs/IMPLEMENTATION_PLAN.md §9) —
// a short staleTime plus retry is a reasonable default for report data that
// doesn't need to be live-second-fresh.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
