import { create } from 'zustand';

import { storage, getAuthToken } from '../lib/storage';

export type EpisodeProgress = {
  position: number;
  duration: number | null;
  updatedAt: number;
};

export type SermonsAudioState = {
  favorites: Record<string, true>;
  progress: Record<string, EpisodeProgress>;
  listened: Record<string, true>;
};

function storageKey(): string {
  const token = getAuthToken();
  const suffix = token ? token.slice(-12) : 'anon';
  return `sermons_audio_v1:${suffix}`;
}

function readState(): SermonsAudioState {
  try {
    const raw = storage.getString(storageKey());
    if (!raw) {
      return { favorites: {}, progress: {}, listened: {} };
    }
    const parsed = JSON.parse(raw) as Partial<SermonsAudioState>;
    return {
      favorites: (parsed.favorites ?? {}) as Record<string, true>,
      progress: (parsed.progress ?? {}) as Record<string, EpisodeProgress>,
      listened: (parsed.listened ?? {}) as Record<string, true>,
    };
  } catch {
    return { favorites: {}, progress: {}, listened: {} };
  }
}

function writeState(state: SermonsAudioState): void {
  storage.set(storageKey(), JSON.stringify(state));
}

interface SermonsStore extends SermonsAudioState {
  hydrate: () => void;
  toggleFavorite: (id: string) => void;
  saveProgress: (id: string, position: number, duration: number | null) => void;
  markListened: (id: string) => void;
  getProgressRatio: (id: string) => number;
  isListened: (id: string) => boolean;
}

export const useSermonsStore = create<SermonsStore>((set, get) => ({
  favorites: {},
  progress: {},
  listened: {},

  hydrate: () => {
    const state = readState();
    set(state);
  },

  toggleFavorite: (id) => {
    set((s) => {
      const favorites = { ...s.favorites };
      if (favorites[id]) {
        delete favorites[id];
      } else {
        favorites[id] = true;
      }
      const next = { ...s, favorites };
      writeState(next);
      return next;
    });
  },

  saveProgress: (id, position, duration) => {
    set((s) => {
      const progress = {
        ...s.progress,
        [id]: { position, duration, updatedAt: Date.now() },
      };
      const next = { ...s, progress };
      writeState(next);
      return next;
    });
    if (duration && duration > 0 && position / duration >= 0.98) {
      get().markListened(id);
    }
  },

  markListened: (id) => {
    set((s) => {
      if (s.listened[id]) return s;
      const listened: Record<string, true> = { ...s.listened, [id]: true };
      const next: SermonsAudioState = { ...s, listened };
      writeState(next);
      return next;
    });
  },

  getProgressRatio: (id) => {
    const p = get().progress[id];
    if (!p?.duration || p.duration <= 0) return 0;
    return Math.max(0, Math.min(1, p.position / p.duration));
  },

  isListened: (id) => {
    const ratio = get().getProgressRatio(id);
    return Boolean(get().listened[id]) || ratio >= 0.98;
  },
}));
