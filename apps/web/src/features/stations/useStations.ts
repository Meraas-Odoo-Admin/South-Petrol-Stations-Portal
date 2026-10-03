import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import type { StationBasicInfo } from './types';

// GET /stations is already server-side scoped (StationsService.findAll
// intersects with RbacService.getStationScope) — a caller only ever gets
// back the stations they're allowed to see, so no extra filtering is
// needed on the frontend for this to be a correctly-scoped picker/list.
export function useStations() {
  return useQuery({
    queryKey: ['stations'],
    queryFn: async () => (await apiClient.get<StationBasicInfo[]>('/stations')).data,
  });
}
