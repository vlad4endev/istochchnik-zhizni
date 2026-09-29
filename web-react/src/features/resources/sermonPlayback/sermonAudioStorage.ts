export type SermonAudioProgress = {
  position: number;
  duration: number | null;
  updatedAt: number;
};

export type SermonAudioState = {
  favorites: Record<string, true>;
  progress: Record<string, SermonAudioProgress>;
  listened: Record<string, true>;
};

/** Ключ по id участника: токен сессии ненадёжен (меняется при refresh, в cookie-режиме общий для всех). */
export function sermonStorageKey(memberId: number | null | undefined): string {
  return `sermons_audio_v2:${typeof memberId === 'number' ? `u${memberId}` : 'anon'}`;
}

export function loadSermonAudioState(storageKey: string): SermonAudioState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { favorites: {}, progress: {}, listened: {} };
    const parsed = JSON.parse(raw) as Partial<SermonAudioState>;
    return {
      favorites: (parsed.favorites ?? {}) as Record<string, true>,
      progress: (parsed.progress ?? {}) as Record<string, SermonAudioProgress>,
      listened: (parsed.listened ?? {}) as Record<string, true>,
    };
  } catch {
    return { favorites: {}, progress: {}, listened: {} };
  }
}

export function saveSermonAudioState(storageKey: string, state: SermonAudioState): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

export function progressRatio(progress: SermonAudioProgress | undefined): number {
  const dur = progress?.duration ?? null;
  const pos = progress?.position ?? 0;
  return dur && dur > 0 ? Math.max(0, Math.min(1, pos / dur)) : 0;
}
