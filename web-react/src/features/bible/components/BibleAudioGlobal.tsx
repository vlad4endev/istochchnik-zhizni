import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LuBookOpen,
  LuGauge,
  LuMoon,
  LuPause,
  LuPlay,
  LuRotateCcw,
  LuRotateCw,
  LuX,
} from 'react-icons/lu';

import { BIBLE_AUDIO_RATES } from '../bibleUiMeta';
import { formatAudioTime, useBibleAudioStore } from '../bibleAudioStore';
import { BibleSheetShell } from './BibleSheetShell';

const SLEEP_MINUTES = [5, 10, 15, 30] as const;

/** Пилюля мини-плеера поверх таб-бара + полноэкранная шторка. Монтируется один раз в Layout. */
export function BibleAudioGlobal() {
  const track = useBibleAudioStore((s) => s.track);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {track ? <MiniPlayerBar /> : null}
      <AudioSheet />
    </>,
    document.body,
  );
}

function MiniPlayerBar() {
  const track = useBibleAudioStore((s) => s.track)!;
  const status = useBibleAudioStore((s) => s.status);
  const time = useBibleAudioStore((s) => s.time);
  const duration = useBibleAudioStore((s) => s.duration);
  const toggle = useBibleAudioStore((s) => s.toggle);
  const close = useBibleAudioStore((s) => s.close);
  const setSheetOpen = useBibleAudioStore((s) => s.setSheetOpen);

  const progress = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
  const playing = status === 'playing';

  return (
    <div className="fixed bottom-[calc(var(--app-bottom-nav-total-height)+0.5rem)] left-3 right-3 z-[95] lg:bottom-6 lg:left-auto lg:right-6 lg:w-[380px]">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#7d3640] to-[#582229] text-white shadow-[0_12px_32px_rgba(88,34,41,0.45)]">
        <div className="absolute inset-x-0 top-0 h-[2.5px] bg-white/15" aria-hidden>
          <div
            className="h-full bg-white/90 transition-[width] duration-300 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Открыть плеер"
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <LuBookOpen size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight">
                {track.bookName} {track.chapter}
              </span>
              <span className="block truncate text-[11px] leading-tight text-white/60">
                {track.translationTitle} · озвучка
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? 'Пауза' : 'Слушать'}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#7d3640] shadow-sm transition active:scale-95"
          >
            {playing ? <LuPause size={18} /> : <LuPlay size={18} className="ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Остановить и закрыть"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <LuX size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AudioSheet() {
  const open = useBibleAudioStore((s) => s.sheetOpen);
  const track = useBibleAudioStore((s) => s.track);
  const status = useBibleAudioStore((s) => s.status);
  const time = useBibleAudioStore((s) => s.time);
  const duration = useBibleAudioStore((s) => s.duration);
  const rate = useBibleAudioStore((s) => s.rate);
  const autoNext = useBibleAudioStore((s) => s.autoNext);
  const sleep = useBibleAudioStore((s) => s.sleep);
  const store = useBibleAudioStore.getState();

  // Обратный отсчёт таймера сна — локальный тик раз в секунду.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (sleep.kind !== 'minutes') return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [sleep.kind]);

  if (!track) return null;

  const playing = status === 'playing';
  const remaining = duration > 0 ? Math.max(0, duration - time) : 0;
  const rates = BIBLE_AUDIO_RATES as readonly number[];
  const nextRate = rates[(rates.indexOf(rate) + 1) % rates.length];
  const sleepLeft = sleep.kind === 'minutes' ? Math.max(0, Math.round((sleep.until - Date.now()) / 1000)) : 0;

  return (
    <BibleSheetShell open={open && Boolean(track)} title="Аудио" onClose={() => store.setSheetOpen(false)}>
      <div className="flex flex-col items-center px-6 pb-8 pt-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#7d3640]/10 text-primary">
          <LuBookOpen size={36} />
        </div>
        <h3 className="mt-4 text-center text-xl font-bold text-stone-900">
          {track.bookName} {track.chapter}
        </h3>
        <p className="mt-0.5 text-sm text-stone-500">{track.translationTitle}</p>

        <div className="mt-6 w-full">
          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={0.5}
            value={Math.min(time, duration || time)}
            onChange={(e) => store.seekTo(Number(e.target.value))}
            aria-label="Позиция воспроизведения"
            className="w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-[11px] font-medium tabular-nums text-stone-500">
            <span>{formatAudioTime(time)}</span>
            <span>−{formatAudioTime(remaining)}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-7">
          <button
            type="button"
            onClick={() => store.skipBy(-15)}
            aria-label="Назад на 15 секунд"
            className="relative inline-flex h-12 w-12 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100 active:scale-95"
          >
            <LuRotateCcw size={26} />
            <span className="absolute text-[8px] font-bold">15</span>
          </button>
          <button
            type="button"
            onClick={() => store.toggle()}
            aria-label={playing ? 'Пауза' : 'Слушать'}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition active:scale-95"
          >
            {playing ? <LuPause size={28} /> : <LuPlay size={28} className="ml-1" />}
          </button>
          <button
            type="button"
            onClick={() => store.skipBy(15)}
            aria-label="Вперёд на 15 секунд"
            className="relative inline-flex h-12 w-12 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100 active:scale-95"
          >
            <LuRotateCw size={26} />
            <span className="absolute text-[8px] font-bold">15</span>
          </button>
        </div>

        <div className="mt-6 flex w-full items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => store.setRate(nextRate)}
            aria-label="Скорость воспроизведения"
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-[13px] font-bold tabular-nums text-stone-700 transition active:scale-95"
          >
            <LuGauge size={15} className="text-primary" />
            {rate}×
          </button>
          <label className="flex items-center gap-2 text-[13px] font-semibold text-stone-700">
            <input
              type="checkbox"
              checked={autoNext}
              onChange={(e) => store.setAutoNext(e.target.checked)}
              className="h-4 w-4 rounded accent-primary"
            />
            Следующая глава
          </label>
        </div>

        <div className="mt-4 w-full">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <LuMoon size={13} className="text-primary" />
            Таймер сна
            {sleep.kind === 'minutes' ? (
              <span className="tabular-nums text-primary">· {formatAudioTime(sleepLeft)}</span>
            ) : sleep.kind === 'chapterEnd' ? (
              <span className="text-primary">· до конца главы</span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <SleepChip
              label="Выкл"
              active={sleep.kind === 'off'}
              onClick={() => store.setSleepOff()}
            />
            {SLEEP_MINUTES.map((m) => (
              <SleepChip
                key={m}
                label={`${m} мин`}
                active={sleep.kind === 'minutes'}
                dimmed={sleep.kind === 'minutes'}
                onClick={() => store.setSleepMinutes(m)}
              />
            ))}
            <SleepChip
              label="До конца главы"
              active={sleep.kind === 'chapterEnd'}
              onClick={() => store.setSleepChapterEnd()}
            />
          </div>
        </div>

        <p className="mt-7 text-[10px] text-stone-400">Озвучка: wordproject.org</p>
      </div>
    </BibleSheetShell>
  );
}

function SleepChip({
  label,
  active,
  dimmed = false,
  onClick,
}: {
  label: string;
  active: boolean;
  /** Чипы минут подсвечиваем как группу: повторный тап просто перезапускает таймер. */
  dimmed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95',
        active
          ? dimmed
            ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
            : 'bg-primary text-white'
          : 'border border-stone-200 bg-white text-stone-600',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
