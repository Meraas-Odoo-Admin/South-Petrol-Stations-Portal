import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import type { StationBasicInfo } from '../stations/types';
import type { PlaceOption } from './PlacePicker';
import type { ActivityItem, CreatedUser, PlaceKind, UserDetail, UserListResponse, UsersOptions } from './types';

export interface UserListFilters {
  q: string;
  side: string;
  roleId: string;
  placeId: string;
  status: string;
  sort?: string;
  dir?: string;
  skip: number;
}

export const USERS_PAGE_SIZE = 25;

export function useUserList(filters: UserListFilters) {
  return useQuery({
    queryKey: ['users', 'list', filters],
    queryFn: async () => {
      const params: Record<string, string | number> = { skip: filters.skip, take: USERS_PAGE_SIZE };
      for (const key of ['q', 'side', 'roleId', 'placeId', 'status', 'sort', 'dir'] as const) {
        if (filters[key]) params[key] = filters[key];
      }
      return (await apiClient.get<UserListResponse>('/users', { params })).data;
    },
    // Typing in the search box keeps the previous rows on screen until the
    // new ones arrive, instead of flashing an empty list.
    placeholderData: keepPreviousData,
  });
}

export function useUserOptions() {
  return useQuery({
    queryKey: ['users', 'options'],
    queryFn: async () => (await apiClient.get<UsersOptions>('/users/options')).data,
  });
}

export function useUserDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['users', 'detail', id],
    enabled: Boolean(id),
    queryFn: async () => (await apiClient.get<UserDetail>(`/users/${id}`)).data,
    retry: false,
  });
}

export function useUserActivity(id: string | undefined) {
  return useQuery({
    queryKey: ['users', 'activity', id],
    enabled: Boolean(id),
    queryFn: async () => (await apiClient.get<ActivityItem[]>(`/users/${id}/activity`)).data,
  });
}

// Every account action returns the refreshed person, so the page can show it
// without a second request; the list and the activity are refreshed too.
export function useAccountMutation<TVariables, TResult = UserDetail>(
  userId: string,
  run: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async (result) => {
      if (result && typeof result === 'object' && 'capabilities' in result) {
        queryClient.setQueryData(['users', 'detail', userId], result);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['users', 'list'] }),
        queryClient.invalidateQueries({ queryKey: ['users', 'activity', userId] }),
        queryClient.invalidateQueries({ queryKey: ['users', 'detail', userId] }),
      ]);
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      username: string;
      fullName: string;
      phone?: string;
      roleId: string;
      placeIds: string[];
    }) => (await apiClient.post<CreatedUser>('/users', body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'list'] }),
  });
}

interface RegistrationStationLite {
  id: string;
  internalCode: string;
  name: string;
  municipality?: { name: string } | null;
}

// The places a person can work, as picker options. Petrol stations come from
// GET /stations and registration offices from GET /registration-stations,
// and both are already narrowed server-side to what the caller may see, so a
// supervisor is only ever offered their own.
export function usePlaceOptions(kind: PlaceKind | 'ALL') {
  const wantStations = kind === 'PETROL_STATION' || kind === 'ALL';
  const wantOffices = kind === 'REGISTRATION' || kind === 'ALL';
  const wantMunicipalities = kind === 'MUNICIPALITY';
  const stations = useQuery({
    queryKey: ['stations'],
    enabled: wantStations,
    queryFn: async () => (await apiClient.get<StationBasicInfo[]>('/stations')).data,
  });
  const offices = useQuery({
    queryKey: ['registration-stations'],
    enabled: wantOffices,
    queryFn: async () => (await apiClient.get<RegistrationStationLite[]>('/registration-stations')).data,
  });
  const municipalities = useQuery({
    queryKey: ['municipalities', 'options'],
    enabled: wantMunicipalities,
    queryFn: async () =>
      (await apiClient.get<{ id: string; name: string; code: string | null }[]>('/municipalities')).data,
  });
  const options: PlaceOption[] = [
    ...(wantMunicipalities
      ? (municipalities.data ?? []).map((m) => ({ id: m.id, name: m.name, code: m.code ?? '', group: 'بلدية' }))
      : []),
    ...(wantStations
      ? (stations.data ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          code: s.internalCode,
          group: kind === 'ALL' ? `محطة وقود${s.municipality ? ` · ${s.municipality.name}` : ''}` : s.municipality?.name,
        }))
      : []),
    ...(wantOffices
      ? (offices.data ?? []).map((o) => ({
          id: o.id,
          name: o.name,
          code: o.internalCode,
          group: kind === 'ALL' ? `مكتب تسجيل${o.municipality ? ` · ${o.municipality.name}` : ''}` : o.municipality?.name,
        }))
      : []),
  ];
  return {
    options,
    isLoading:
      (wantStations && stations.isLoading) || (wantOffices && offices.isLoading) || (wantMunicipalities && municipalities.isLoading),
    isError:
      (wantStations && stations.isError) || (wantOffices && offices.isError) || (wantMunicipalities && municipalities.isError),
  };
}
