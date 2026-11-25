import { create } from 'zustand';

import { fetchBibleAudio, type BibleAudio } from './api';
import {
  BIBLE_AUDIO_RATES,
  readBibleAudioPrefs,
  writeBibleAudioPrefs,
} from './bibleUiMeta';

export type BibleAudioTrack = {
  translation: string;
  translationTitle: string;
  bookSlug: string;
  bookName: string;
  chapter: number;
  audioUrl: string;
  timings: BibleAudio['timings'];
};

export type BibleAudioSleep =
  | { kind: 'off' }
  | { kind: 'chapterEnd' }
  | { kind: 'minutes'; until: number };

export type BibleAudioBookInfo = { slug: string; name: string; chapters_count: number };

type PlayChapterInput = {
  translation: string;
  translationTitle?: string;
  bookSlug: string;
  bookName: string;
  chapter: number;
  audio: BibleAudio;
};

type State = {
  track: BibleAudioTrack | null;
  status: 'idle' | 'playing' | 'paused';
  time: number;
  duration: number;
  rate: number;
  autoNext: boolean;
  sleep: BibleAudioSleep;
  sheetOpen: boolean;
  /** Книги текущего перевода — для автоперехода к следующей главе/книге. */
  books: BibleAudioBookInfo[];

  playChapter: (
    input: PlayChapterInput,
    opts?: { seekVerse?: number | null; autoplay?: boolean },
  ) => void;
  toggle: () => void;
  seekTo: (t: number) => void;
  skipBy: (delta: number) => void;
  setRate: (rate: number) => void;
  setAutoNext: (v: boolean) => void;
  setSleepOff: () => void;
  setSleepMinutes: (minutes: number) => void;
  setSleepChapterEnd: () => void;
  setSheetOpen: (v: boolean) => void;
  setBooks: (books: BibleAudioBookInfo[]) => void;
  close: () => void;
};

export function formatAudioTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Синглтон <audio>: звук не обрывается при переходах между страницами SPA.
const el = typeof Audio !== 'undefined' ? new Audio() : null;
if (el) el.preload = 'metadata';

/** Переход на следующую главу через роутер (регистрирует читалка, пока открыта). */
let navigatorFn: ((bookSlug: string, chapter: number) => void) | null = null;
export function registerBibleAudioNavigator(fn: typeof navigatorFn): void {
  navigatorFn = fn;
}

let sleepTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSeek: number | null = null;

function clearSleepTimer(): void {
  if (sleepTimer != null) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
  }
}

const initialPrefs = readBibleAudioPrefs();

export const useBibleAudioStore = create<State>((set, get) => {
  function persistPrefs(): void {
    const { rate, autoNext } = get();
    writeBibleAudioPrefs({ rate, autoNext });
  }

  function resolveNextTarget(): { bookSlug: string; bookName: string; chapter: number } | null {
    const { track, books } = get();
    if (!track) return null;
    const idx = books.findIndex((b) => b.slug === track.bookSlug);
    const cur = idx >= 0 ? books[idx] : undefined;
    if (cur && track.chapter < cur.chapters_count) {
      return { bookSlug: cur.slug, bookName: cur.name, chapter: track.chapter + 1 };
    }
    const next = idx >= 0 ? books[idx + 1] : undefined;
    return next ? { bookSlug: next.slug, bookName: next.name, chapter: 1 } : null;
  }

  function handleEnded(): void {
    const { sleep, autoNext, track } = get();
    set({ status: 'paused' });
    if (sleep.kind === 'chapterEnd') {
      set({ sleep: { kind: 'off' } });
      return;
    }
    if (!autoNext || !track) return;
    const target = resolveNextTarget();
    if (!target) return;
    if (navigatorFn) {
      navigatorFn(target.bookSlug, target.chapter);
      return;
    }
    // Читалка закрыта — продолжаем слушать следующую главу без навигации.
    void fetchBibleAudio(track.translation, target.bookSlug, target.chapter).then((audio) => {
      if (!audio) return;
      get().playChapter({
        translation: track.translation,
        translationTitle: track.translationTitle,
        bookSlug: target.bookSlug,
        bookName: target.bookName,
        chapter: target.chapter,
        audio,
      });
    });
  }

  if (el) {
    el.addEventListener('timeupdate', () => set({ time: el.currentTime }));
    el.addEventListener('loadedmetadata', () => {
      set({ duration: Number.isFinite(el.duration) ? el.duration : 0 });
      if (pendingSeek != null) {
        el.currentTime = pendingSeek;
        set({ time: pendingSeek });
        pendingSeek = null;
      }
    });
    el.addEventListener('play', () => set({ status: 'playing' }));
    el.addEventListener('pause', () => set({ status: 'paused' }));
    el.addEventListener('ended', handleEnded);
    el.addEventListener('error', () => set({ status: 'paused' }));
  }

  return {
    track: null,
    status: 'idle',
    time: 0,
    duration: 0,
    rate: initialPrefs.rate,
    autoNext: initialPrefs.autoNext,
    sleep: { kind: 'off' },
    sheetOpen: false,
    books: [],

    playChapter: (input, opts) => {
      if (!el || input.audio.audio_url.endsWith('.json')) return;
      const track: BibleAudioTrack = {
        translation: input.translation,
        translationTitle: input.translationTitle || input.translation,
        bookSlug: input.bookSlug,
        bookName: input.bookName,
        chapter: input.chapter,
        audioUrl: input.audio.audio_url,
        timings: input.audio.timings,
      };
      const timing =
        opts?.seekVerse != null ? input.audio.timings.find((t) => t.v === opts.seekVerse) : undefined;
      pendingSeek = timing ? timing.start : 0;
      el.src = track.audioUrl;
      el.playbackRate = get().rate;
      set({ track, time: pendingSeek, duration: 0 });
      updateMediaSession(track);
      if (opts?.autoplay === false) {
        set({ status: 'paused' });
        return;
      }
      void el.play().catch(() => set({ status: 'paused' }));
    },

    toggle: () => {
      if (!el || !get().track) return;
      if (el.paused) {
        void el.play().catch(() => undefined);
      } else {
        el.pause();
      }
    },

    seekTo: (t) => {
      if (!el || !Number.isFinite(t)) return;
      el.currentTime = Math.max(0, t);
      set({ time: el.currentTime });
    },

    skipBy: (delta) => {
      if (!el || !Number.isFinite(el.duration)) return;
      el.currentTime = Math.min(Math.max(0, el.currentTime + delta), el.duration);
      set({ time: el.currentTime });
    },

    setRate: (rate) => {
      if (!(BIBLE_AUDIO_RATES as readonly number[]).includes(rate)) return;
      if (el) el.playbackRate = rate;
      set({ rate });
      persistPrefs();
    },

    setAutoNext: (v) => {
      set({ autoNext: v });
      persistPrefs();
    },

    setSleepOff: () => {
      clearSleepTimer();
      set({ sleep: { kind: 'off' } });
    },

    setSleepMinutes: (minutes) => {
      clearSleepTimer();
      const until = Date.now() + minutes * 60_000;
      set({ sleep: { kind: 'minutes', until } });
      sleepTimer = setTimeout(() => {
        el?.pause();
        clearSleepTimer();
        set({ sleep: { kind: 'off' } });
      }, minutes * 60_000);
    },

    setSleepChapterEnd: () => {
      clearSleepTimer();
      set({ sleep: { kind: 'chapterEnd' } });
    },

    setSheetOpen: (v) => set({ sheetOpen: v }),
    setBooks: (books) => set({ books }),

    close: () => {
      clearSleepTimer();
      if (el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
      set({
        track: null,
        status: 'idle',
        time: 0,
        duration: 0,
        sleep: { kind: 'off' },
        sheetOpen: false,
      });
      updateMediaSession(null);
    },
  };
});

function updateMediaSession(track: BibleAudioTrack | null): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: `${track.bookName} ${track.chapter}`,
          artist: track.translationTitle,
          album: 'Аудио Библия · wordproject.org',
        })
      : null;
  } catch {
    /* Media Session может быть недоступна */
  }
}

if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
  try {
    navigator.mediaSession.setActionHandler('play', () => useBibleAudioStore.getState().toggle());
    navigator.mediaSession.setActionHandler('pause', () => useBibleAudioStore.getState().toggle());
    navigator.mediaSession.setActionHandler('seekbackward', () =>
      useBibleAudioStore.getState().skipBy(-15),
    );
    navigator.mediaSession.setActionHandler('seekforward', () =>
      useBibleAudioStore.getState().skipBy(15),
    );
  } catch {
    /* ignore */
  }
}
