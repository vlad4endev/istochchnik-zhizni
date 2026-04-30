import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { fetchActiveBroadcast } from '@/api/broadcast';
import { getActiveEvents, getCalendarDay, formatCalendarDayKey } from '@/features/calendar/api';
import { fetchSongs } from '@/features/songbook/api';
import { useCacheStore } from '@/stores/cacheStore';

type PrefetchConfig = {
  key: string;
  queryKey: readonly unknown[];
  fetcher: () => Promise<unknown>;
  ttl: number;
};

function todayKey(): string {
  return formatCalendarDayKey(new Date());
}

const PREFETCH_BY_PATH: Record<string, PrefetchConfig> = {
  '/dashboard': {
    key: 'dashboard:broadcast',
    queryKey: ['broadcast', 'active'],
    fetcher: fetchActiveBroadcast,
    ttl: 5_000,
  },
  '/songbook': {
    key: 'songs:list',
    queryKey: ['songs', 'catalog'],
    fetcher: fetchSongs,
    ttl: 300_000,
  },
  '/prayer': {
    key: 'prayer:cycle',
    queryKey: ['calendar', 'day', 'today-prefetch'],
    fetcher: () => getCalendarDay(todayKey()),
    ttl: 60_000,
  },
  '/events': {
    key: 'events:list',
    queryKey: ['calendar', 'events', 'dashboard'],
    fetcher: getActiveEvents,
    ttl: 120_000,
  },
};

export function usePrefetch() {
  const qc = useQueryClient();
  const cache = useCacheStore();

  const prefetch = useCallback(
    (path: string) => {
      const cfg = PREFETCH_BY_PATH[path];
      if (!cfg) return;
      if (cache.get(cfg.key, cfg.ttl) != null) return;
      void qc
        .prefetchQuery({
          queryKey: cfg.queryKey,
          queryFn: cfg.fetcher,
          staleTime: cfg.ttl,
        })
        .then((res) => {
          if (res !== undefined) cache.set(cfg.key, res);
        })
        .catch(() => {});
    },
    [cache, qc],
  );

  return { prefetch };
}
