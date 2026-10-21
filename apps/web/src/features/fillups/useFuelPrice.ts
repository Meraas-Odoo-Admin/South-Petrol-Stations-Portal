import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import type { CreateFillUpRequest } from '@fuel-tracking/shared-types';

type FuelPrices = Record<CreateFillUpRequest['fuelType'], number>;

// GET /fillups/fuel-prices reads three SystemSetting rows (CLAUDE.md rule
// 4 — never hardcode a tunable number). Gated on fillups:create, same as
// the exception-types lookup, so any station employee recording a fill-up
// can see it, not just settings:manage admins.
// After review (21 Oct 2026): the fixed amount of every fill-up, in LYD
// (setting fillup.fixed_amount_lyd).
export function useFillAmount() {
  return useQuery({
    queryKey: ['fillups', 'fill-amount'],
    queryFn: async () => (await apiClient.get<{ amountLyd: number }>('/fillups/fill-amount')).data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFuelPrices() {
  return useQuery({
    queryKey: ['fillups', 'fuel-prices'],
    queryFn: async () => (await apiClient.get<FuelPrices>('/fillups/fuel-prices')).data,
    staleTime: 5 * 60 * 1000,
  });
}
