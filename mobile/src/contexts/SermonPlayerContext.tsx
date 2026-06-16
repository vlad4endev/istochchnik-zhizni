import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';

import type { PodcastEpisode } from '../api/resources';
import { useSermonsStore } from '../stores/sermonsStore';

type SermonPlayerContextValue = {
  activeEpisode: PodcastEpisode | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  playEpisode: (ep: PodcastEpisode) => void;
  togglePlayPause: () => void;
  closePlayer: () => void;
  seekTo: (seconds: number) => void;
};

const SermonPlayerContext = createContext<SermonPlayerContextValue | null>(null);

export function SermonPlayerProvider({ children }: { children: ReactNode }) {
  const [activeEpisode, setActiveEpisode] = useState<PodcastEpisode | null>(null);
  const activeEpisodeRef = useRef<PodcastEpisode | null>(null);
  const saveProgress = useSermonsStore((s) => s.saveProgress);
  const progressMap = useSermonsStore((s) => s.progress);
  const lastSaveRef = useRef(0);
  const seekAppliedRef = useRef<string | null>(null);
  const pendingPlayRef = useRef(false);

  const audioSource = activeEpisode?.audioUrl ?? null;
  const player = useAudioPlayer(audioSource, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    });
  }, []);

  useEffect(() => {
    activeEpisodeRef.current = activeEpisode;
  }, [activeEpisode]);

  useEffect(() => {
    if (!activeEpisode || !status.isLoaded) return;
    if (seekAppliedRef.current === activeEpisode.id) return;
    seekAppliedRef.current = activeEpisode.id;
    const saved = progressMap[activeEpisode.id]?.position ?? 0;
    const dur = status.duration > 0 ? status.duration : (activeEpisode.duration ?? 0);
    if (saved > 2 && dur > 0 && saved < dur - 2) {
      void player.seekTo(saved);
    }
  }, [activeEpisode, status.isLoaded, status.duration, progressMap, player]);

  useEffect(() => {
    const ep = activeEpisodeRef.current;
    if (!ep || !status.isLoaded) return;
    const now = Date.now();
    if (now - lastSaveRef.current < 2000) return;
    lastSaveRef.current = now;
    const duration = status.duration > 0 ? status.duration : null;
    saveProgress(ep.id, status.currentTime, duration);
  }, [status.currentTime, status.isLoaded, status.duration, saveProgress]);

  useEffect(() => {
    if (!activeEpisode) return;
    if (status.didJustFinish) {
      saveProgress(
        activeEpisode.id,
        0,
        status.duration > 0 ? status.duration : null,
      );
      useSermonsStore.getState().markListened(activeEpisode.id);
    }
  }, [status.didJustFinish, activeEpisode, status.duration, saveProgress]);

  useEffect(() => {
    if (!pendingPlayRef.current || !activeEpisode || !status.isLoaded) return;
    pendingPlayRef.current = false;
    player.play();
  }, [activeEpisode, status.isLoaded, player]);

  const playEpisode = useCallback(
    (ep: PodcastEpisode) => {
      if (activeEpisodeRef.current?.id === ep.id) {
        if (player.playing) {
          player.pause();
        } else {
          player.play();
        }
        return;
      }
      seekAppliedRef.current = null;
      pendingPlayRef.current = true;
      setActiveEpisode(ep);
    },
    [player],
  );

  const togglePlayPause = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player]);

  const closePlayer = useCallback(() => {
    const ep = activeEpisodeRef.current;
    if (ep && status.isLoaded) {
      saveProgress(
        ep.id,
        status.currentTime,
        status.duration > 0 ? status.duration : null,
      );
    }
    player.pause();
    setActiveEpisode(null);
    seekAppliedRef.current = null;
  }, [player, status.currentTime, status.duration, status.isLoaded, saveProgress]);

  const seekTo = useCallback(
    (seconds: number) => {
      void player.seekTo(seconds);
    },
    [player],
  );

  const value = useMemo<SermonPlayerContextValue>(
    () => ({
      activeEpisode,
      playing: status.playing,
      currentTime: status.currentTime,
      duration: status.duration,
      playEpisode,
      togglePlayPause,
      closePlayer,
      seekTo,
    }),
    [
      activeEpisode,
      status.playing,
      status.currentTime,
      status.duration,
      playEpisode,
      togglePlayPause,
      closePlayer,
      seekTo,
    ],
  );

  return (
    <SermonPlayerContext.Provider value={value}>{children}</SermonPlayerContext.Provider>
  );
}

export function useSermonPlayer(): SermonPlayerContextValue {
  const ctx = useContext(SermonPlayerContext);
  if (!ctx) {
    throw new Error('useSermonPlayer must be used within SermonPlayerProvider');
  }
  return ctx;
}
