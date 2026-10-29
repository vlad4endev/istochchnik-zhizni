import { useEffect, useRef, useState } from 'react';
import { LuPause, LuPlay } from 'react-icons/lu';

import type { BibleAudio } from '../api';
import { verseFromTimings } from '../bibleRef';

type Props = {
  audio: BibleAudio;
  onActiveVerse?: (verse: number | null) => void;
  seekVerse?: number | null;
};

export function SyncedAudioPlayer({ audio, onActiveVerse, seekVerse }: Props) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);

  const isJsonPlaceholder = audio.audio_url.endsWith('.json');

  useEffect(() => {
    const el = ref.current;
    if (!el || seekVerse == null) return;
    const timing = audio.timings.find((t) => t.v === seekVerse);
    if (!timing) return;
    el.currentTime = timing.start;
    void el.play().then(() => setPlaying(true)).catch(() => undefined);
  }, [seekVerse, audio.timings]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.playbackRate = rate;
  }, [rate]);

  if (isJsonPlaceholder) {
    return (
      <div className="rounded-2xl border border-stone-200/80 bg-stone-50 px-3 py-2 text-sm text-stone-600">
        Тайминги стихов готовы ({audio.timings.length}). MP3-озвучка ещё не сгенерирована —
        запустите <code className="text-xs">npm run bible:audio</code> с TTS или подставьте файл.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] px-3 py-2 shadow-[var(--shadow-card)]">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white"
        aria-label={playing ? 'Пауза' : 'Слушать'}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          if (el.paused) {
            void el.play().then(() => setPlaying(true)).catch(() => undefined);
          } else {
            el.pause();
            setPlaying(false);
          }
        }}
      >
        {playing ? <LuPause size={18} /> : <LuPlay size={18} />}
      </button>
      <label className="text-xs font-medium text-stone-500">
        Скорость{' '}
        <select
          className="ml-1 rounded-md border border-stone-200 bg-white px-1.5 py-1 text-stone-800"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        >
          {[0.75, 1, 1.25, 1.5].map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </label>
      <audio
        ref={ref}
        src={audio.audio_url}
        preload="metadata"
        onTimeUpdate={() => {
          const t = ref.current?.currentTime ?? 0;
          onActiveVerse?.(verseFromTimings(audio.timings, t));
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onEnded={() => {
          setPlaying(false);
          onActiveVerse?.(null);
        }}
      />
    </div>
  );
}
