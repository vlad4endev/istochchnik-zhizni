import { create } from 'zustand';

export type AudioTrack = {
  id: string;
  title: string;
  audioUrl: string;
  imageUrl: string | null;
  pubDate: string | null;
  duration: number | null;
};

type AudioPlayerState = {
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  /** 0..1 */
  progress: number;

  play: (track: AudioTrack) => void;
  pause: () => void;
  toggle: () => void;
  setProgress: (progress: number) => void;
  close: () => void;
};

export const useAudioPlayerStore = create<AudioPlayerState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  progress: 0,

  play: (track) => set({ currentTrack: track, isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  toggle: () => set({ isPlaying: !get().isPlaying }),
  setProgress: (progress) => set({ progress: Math.max(0, Math.min(1, Number(progress) || 0)) }),
  close: () => set({ currentTrack: null, isPlaying: false, progress: 0 }),
}));

