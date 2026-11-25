import { useCallback, useEffect, useRef, useState } from 'react';
import { LuPause, LuPlay, LuRotateCcw, LuRotateCw } from 'react-icons/lu';

import type { BibleAudio } from '../api';
import { verseFromTimings } from '../bibleRef';
import {
  BIBLE_AUDIO_RATES,
  readBibleAudioPrefs,
  writeBibleAudioPrefs,
} from '../bibleUiMeta';

type Props = {
  audio: BibleAudio;
  /** Подпись для Media Session (экран блокировки): «От Матфея 5». */
  title?: string;
  onActiveVerse?: (verse: number | null) => void;
  seekVerse?: number | null;
  /** Меняется при повторном запросе того же стиха (кнопка «Слушать»). */
  seekNonce?: number;
  /**
   * Аудио закончилось и включён автопереход — родитель решает,
   * куда идти дальше (следующая глава или первая глава следующей книги).
   */
  onAutoNext?: () => void;
};

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function SyncedAudioPlayer({
  audio,
  title,
  onActiveVerse,
  seekVerse,
  seekNonce = 0,
  onAutoNext,
}: Props) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [prefs, setPrefs] = useState(() => readBibleAudioPrefs());
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const isJsonPlaceholder = audio.audio_url.endsWith('.json');
  const { rate, autoNext } = prefs;

  const play = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    void el
      .play()
      .then(() => setPlaying(true))
      .catch(() => undefined);
  }, []);

  const pause = useCallback(() => {
    ref.current?.pause();
    setPlaying(false);
  }, []);

  const skip = useCallback((delta: number) => {
    const el = ref.current;
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = Math.min(Math.max(0, el.currentTime + delta), el.duration);
  }, []);

  // «Слушать» из панели стиха: с таймингами — с нужного стиха,
  // без них (внешняя озвучка главы целиком) — с начала главы.
  useEffect(() => {
    const el = ref.current;
    if (!el || seekVerse == null) return;
    const timing = audio.timings.find((t) => t.v === seekVerse);
    el.currentTime = timing ? timing.start : 0;
    play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekVerse, seekNonce, audio.timings]);

  useEffect(() => {
    const el = ref.current;
    if (el) el.playbackRate = rate;
  }, [rate, audio.audio_url]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
  }, [audio.audio_url]);

  // Кнопки на экране блокировки / в шторке уведомлений.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title ?? 'Аудио Библия',
        artist: 'Синодальный перевод',
        album: 'Озвучка · wordproject.org',
      });
      navigator.mediaSession.setActionHandler('play', play);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('seekbackward', () => skip(-15));
      navigator.mediaSession.setActionHandler('seekforward', () => skip(15));
    } catch {
      /* Media Session может быть недоступна */
    }
  }, [title, play, pause, skip]);

  if (isJsonPlaceholder) {
    return (
      <div className="rounded-2xl border border-stone-200/80 bg-stone-50 px-3 py-2 text-sm text-stone-600">
        Тайминги стихов готовы ({audio.timings.length}). MP3-озвучка ещё не сгенерирована —
        запустите <code className="text-xs">npm run bible:audio</code> с TTS или подставьте файл.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] px-3 py-2.5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Назад на 15 секунд"
          onClick={() => skip(-15)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100 active:scale-95"
        >
          <LuRotateCcw size={17} />
        </button>
        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition active:scale-95"
          aria-label={playing ? 'Пауза' : 'Слушать'}
          onClick={() => (playing ? pause() : play())}
        >
          {playing ? <LuPause size={19} /> : <LuPlay size={19} className="ml-0.5" />}
        </button>
        <button
          type="button"
          aria-label="Вперёд на 15 секунд"
          onClick={() => skip(15)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100 active:scale-95"
        >
          <LuRotateCw size={17} />
        </button>
        <div className="ml-1 flex min-w-0 flex-1 items-center gap-2">
          <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-stone-500">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            aria-label="Позиция воспроизведения"
            min={0}
            max={duration > 0 ? duration : 1}
            step={0.5}
            value={Math.min(currentTime, duration > 0 ? duration : 0)}
            onChange={(e) => {
              const el = ref.current;
              const t = Number(e.target.value);
              if (el && Number.isFinite(t)) {
                el.currentTime = t;
                setCurrentTime(t);
              }
            }}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary"
          />
          <span className="w-10 shrink-0 text-[11px] tabular-nums text-stone-500">
            {formatTime(duration)}
          </span>
        </div>
        <select
          aria-label="Скорость воспроизведения"
          className="shrink-0 rounded-lg border border-stone-200 bg-white px-1.5 py-1 text-xs font-semibold text-stone-800"
          value={rate}
          onChange={(e) => {
            const next = { ...prefs, rate: Number(e.target.value) };
            setPrefs(next);
            writeBibleAudioPrefs(next);
          }}
        >
          {BIBLE_AUDIO_RATES.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 pl-1 pr-1">
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-stone-500">
          <input
            type="checkbox"
            checked={autoNext}
            onChange={(e) => {
              const next = { ...prefs, autoNext: e.target.checked };
              setPrefs(next);
              writeBibleAudioPrefs(next);
            }}
            className="h-3.5 w-3.5 rounded accent-primary"
          />
          Следующая глава автоматически
        </label>
        <span className="text-[10px] text-stone-400">Озвучка: wordproject.org</span>
      </div>
      <audio
        ref={ref}
        src={audio.audio_url}
        preload="metadata"
        onTimeUpdate={() => {
          const t = ref.current?.currentTime ?? 0;
          setCurrentTime(t);
          onActiveVerse?.(verseFromTimings(audio.timings, t));
        }}
        onLoadedMetadata={() => setDuration(ref.current?.duration ?? 0)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onEnded={() => {
          setPlaying(false);
          onActiveVerse?.(null);
          if (autoNext) onAutoNext?.();
        }}
      />
    </div>
  );
}
