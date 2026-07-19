import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';

import type { PodcastEpisode } from '../../../api/resources';
import { useAuthStore } from '../../auth/authStore';
import {
  loadSermonAudioState,
  progressRatio,
  saveSermonAudioState,
  sermonStorageKey,
  type SermonAudioState,
} from './sermonAudioStorage';

export type SermonPlaybackSession = {
  episode: PodcastEpisode;
  feedTitle: string | null;
};

type SermonPlaybackContextValue = {
  session: SermonPlaybackSession | null;
  audioState: SermonAudioState;
  isPlaying: boolean;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  playEpisode: (episode: PodcastEpisode, feedTitle?: string | null) => void;
  closePlayer: () => void;
  toggleFavorite: (id: string) => void;
  markListened: (id: string) => void;
  saveProgress: (id: string, position: number, duration: number | null) => void;
  setIsPlaying: (v: boolean) => void;
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  requestPlayToken: number;
};

const SermonPlaybackContext = createContext<SermonPlaybackContextValue | null>(null);

export function SermonPlaybackProvider({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const storageKey = useMemo(() => sermonStorageKey(token), [token]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [session, setSession] = useState<SermonPlaybackSession | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [requestPlayToken, setRequestPlayToken] = useState(0);
  const [audioState, setAudioState] = useState<SermonAudioState>(() => loadSermonAudioState(storageKey));

  useEffect(() => {
    setAudioState(loadSermonAudioState(storageKey));
  }, [storageKey]);

  useEffect(() => {
    saveSermonAudioState(storageKey, audioState);
  }, [audioState, storageKey]);

  const toggleFavorite = useCallback((id: string) => {
    setAudioState((s) => {
      const next = { ...s, favorites: { ...s.favorites } };
      if (next.favorites[id]) delete next.favorites[id];
      else next.favorites[id] = true;
      return next;
    });
  }, []);

  const markListened = useCallback((id: string) => {
    setAudioState((s) => ({ ...s, listened: { ...s.listened, [id]: true } }));
  }, []);

  const saveProgress = useCallback((id: string, position: number, duration: number | null) => {
    setAudioState((s) => ({
      ...s,
      progress: {
        ...s.progress,
        [id]: { position, duration, updatedAt: Date.now() },
      },
    }));
  }, []);

  const playEpisode = useCallback((episode: PodcastEpisode, feedTitle?: string | null) => {
    setSession({ episode, feedTitle: feedTitle ?? null });
    setExpanded(false);
    setRequestPlayToken((n) => n + 1);
  }, []);

  const closePlayer = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      try {
        el.removeAttribute('src');
        el.load();
      } catch {
        /* ignore */
      }
    }
    setIsPlaying(false);
    setExpanded(false);
    setSession(null);
  }, []);

  const value = useMemo<SermonPlaybackContextValue>(
    () => ({
      session,
      audioState,
      isPlaying,
      expanded,
      setExpanded,
      playEpisode,
      closePlayer,
      toggleFavorite,
      markListened,
      saveProgress,
      setIsPlaying,
      audioRef,
      requestPlayToken,
    }),
    [
      session,
      audioState,
      isPlaying,
      expanded,
      playEpisode,
      closePlayer,
      toggleFavorite,
      markListened,
      saveProgress,
      requestPlayToken,
    ],
  );

  return <SermonPlaybackContext.Provider value={value}>{children}</SermonPlaybackContext.Provider>;
}

export function useSermonPlayback(): SermonPlaybackContextValue {
  const ctx = useContext(SermonPlaybackContext);
  if (!ctx) {
    throw new Error('useSermonPlayback must be used within SermonPlaybackProvider');
  }
  return ctx;
}

export function useSermonPlaybackOptional(): SermonPlaybackContextValue | null {
  return useContext(SermonPlaybackContext);
}

export { progressRatio };
