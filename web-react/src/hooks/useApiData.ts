import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, type QueryKey } from '@tanstack/react-query';

import { useCacheStore } from '@/stores/cacheStore';

type UseApiDataOptions<T> = {
  ttl?: number;
  immediate?: boolean;
  queryKey?: QueryKey;
  onSuccess?: (data: T) => void;
};

export function useApiData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseApiDataOptions<T> = {},
) {
  const { ttl = 60_000, immediate = true, queryKey, onSuccess } = options;
  const cache = useCacheStore();
  const cached = useCacheStore(useCallback((s) => s.peek<T>(key), [key]));

  const resolvedQueryKey = useMemo<QueryKey>(() => queryKey ?? ['swr', key], [queryKey, key]);

  const query = useQuery({
    queryKey: resolvedQueryKey,
    queryFn: fetcher,
    enabled: immediate,
    staleTime: ttl,
    gcTime: Math.max(ttl * 2, 120_000),
    initialData: () => (cached == null ? undefined : cached),
  });

  useEffect(() => {
    if (query.data !== undefined) {
      cache.set(key, query.data);
      onSuccess?.(query.data);
    }
  }, [cache, key, onSuccess, query.data]);

  const refresh = useCallback(async () => {
    cache.invalidate(key);
    await query.refetch();
  }, [cache, key, query]);

  return {
    data: query.data ?? cached ?? null,
    loading: query.isPending && cached == null,
    isRefreshing: query.isFetching && query.data != null,
    error: query.error,
    isStale: cached != null && query.isFetching,
    refresh,
  };
}
