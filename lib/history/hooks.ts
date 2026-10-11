'use client';

import {useQuery} from '@tanstack/react-query';
import type {Address} from 'viem';
import type {ActivityItem, HistoryResponse} from './types';

export const HISTORY_KEY = 'activity-history';

export function useHistory(options?: {
  vault?: Address;
  account?: Address;
  enabled?: boolean;
}) {
  const vault = options?.vault;
  const account = options?.account;
  const enabled = options?.enabled ?? true;

  return useQuery({
    queryKey: [HISTORY_KEY, vault ?? 'all', account ?? 'all'],
    queryFn: async (): Promise<ActivityItem[]> => {
      const params = new URLSearchParams();
      if (vault) params.set('vault', vault);
      if (account) params.set('account', account);

      const url = `/api/history${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url);
      const data: HistoryResponse = await res.json();
      if (!res.ok) throw new Error((data as unknown as {error?: string}).error ?? 'Failed to load activity history');
      return data.items;
    },
    enabled,
    refetchInterval: 3_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
