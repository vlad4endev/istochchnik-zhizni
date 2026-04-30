import { create } from 'zustand';

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

type CacheState = {
  entries: Record<string, CacheEntry<unknown>>;
  get: <T>(key: string, ttlMs?: number) => T | null;
  peek: <T>(key: string) => T | null;
  set: <T>(key: string, data: T) => void;
  invalidate: (key: string) => void;
  invalidatePrefix: (prefix: string) => void;
};

export const useCacheStore = create<CacheState>((set, getState) => ({
  entries: {},
  get: <T>(key: string, ttlMs = 60_000): T | null => {
    const entry = getState().entries[key] as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > ttlMs) return null;
    return entry.data;
  },
  peek: <T>(key: string): T | null => {
    const entry = getState().entries[key] as CacheEntry<T> | undefined;
    return entry ? entry.data : null;
  },
  set: <T>(key: string, data: T) => {
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: { data, fetchedAt: Date.now() },
      },
    }));
  },
  invalidate: (key: string) => {
    set((state) => {
      if (!(key in state.entries)) return state;
      const next = { ...state.entries };
      delete next[key];
      return { entries: next };
    });
  },
  invalidatePrefix: (prefix: string) => {
    set((state) => {
      const next: Record<string, CacheEntry<unknown>> = {};
      for (const [key, value] of Object.entries(state.entries)) {
        if (!key.startsWith(prefix)) next[key] = value;
      }
      return { entries: next };
    });
  },
}));
