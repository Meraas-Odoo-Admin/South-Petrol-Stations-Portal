import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { LIST_PAGE_SIZE } from '../../lib/pageSize';

// What the fuel-stock endpoints return (apps/api/src/fuel-stock).

export type StockStatus = 'OK' | 'LOW' | 'EMPTY' | 'DATA_WARNING' | 'NOT_SET_UP';

export interface FuelLevel {
  fuelType: string;
  fuelLabel: string;
  configured: boolean;
  capacityLiters: number | null;
  level: number | null;
  percentFull: number | null;
  status: StockStatus;
  detail?: {
    openingLevelLiters: number;
    openedAt: string;
    baselineAt: string;
    delivered: number;
    dispensed: number;
    lastResetAt: string | null;
    computedLevel?: number;
  };
}

export interface StationFuelStock {
  stationId: string;
  visible: boolean;
  showToEmployees: boolean;
  threshold: number | null;
  levels: FuelLevel[];
}

export interface FuelEntry {
  id: string;
  fuelType: string;
  fuelLabel: string;
  kind: 'DELIVERY' | 'RESET';
  occurredAt: string;
  createdAt: string;
  createdBy: { id: string; fullName: string };
  truckPlate: string | null;
  waybillNumber: string | null;
  driverName: string | null;
  reason: string | null;
  originalLiters: number;
  liters: number;
  corrected: boolean;
  corrections: Array<{ id: string; liters: number; reason: string | null; createdAt: string; createdBy: { fullName: string } }>;
}

export const STOCK_STATUS_TEXT: Record<StockStatus, string> = {
  OK: 'سليم',
  LOW: 'منخفض',
  EMPTY: 'فارغ',
  DATA_WARNING: 'بيانات تحتاج مراجعة',
  NOT_SET_UP: 'لم يُضبط الخزان',
};
export const STOCK_STATUS_VARIANT: Record<StockStatus, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  OK: 'ok',
  LOW: 'warn',
  EMPTY: 'danger',
  DATA_WARNING: 'danger',
  NOT_SET_UP: 'neutral',
};

export const litersText = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)} لتر`;

export function useFuelStock(stationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['fuel-stock', stationId],
    enabled: Boolean(stationId) && enabled,
    queryFn: async () => (await apiClient.get<StationFuelStock>(`/stations/${stationId}/fuel-stock`)).data,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export const FUEL_ENTRIES_PAGE_SIZE = LIST_PAGE_SIZE;

// One page of the delivery / reset log (newest first) and the total.
export function useFuelEntries(stationId: string | undefined, enabled: boolean, skip = 0) {
  return useQuery({
    queryKey: ['fuel-stock', stationId, 'entries', skip],
    enabled: Boolean(stationId) && enabled,
    placeholderData: (prev) => prev,
    queryFn: async () =>
      (
        await apiClient.get<{ entries: FuelEntry[]; total: number }>(`/stations/${stationId}/fuel-stock/entries`, {
          params: { skip, take: FUEL_ENTRIES_PAGE_SIZE },
        })
      ).data,
  });
}
