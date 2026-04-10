import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LuChevronLeft,
  LuChevronRight,
  LuMinus,
  LuPause,
  LuPlay,
  LuPlus,
  LuX,
} from 'react-icons/lu';

import { useWakeLock } from '../../../hooks/useWakeLock';
import { LyricsWithChords } from '../../songbook/components/LyricsWithChords';

import { fetchPerformance } from '../api';
import { studioSetlistDetailPath, useStudioModuleSurface } from '../studioPaths';

export function PerformPage() {
  const { id } = useParams<{ id: string }>();
  const setlistId = Number(id);
  const navigate = useNavigate();
  const surface = useStudioModuleSurface();
  const q = useQuery({
    queryKey: ['studio', 'perform', setlistId],
    queryFn: () => fetchPerformance(setlistId),
    enabled: Number.isInteger(setlistId) && setlistId > 0,
  });

  const [index, setIndex] = useState(0);
  const [transpose, setTranspose] = useState(0);
  const [autoScroll, setAutoScroll] = useState(false);
  const [speedPxPerSec, setSpeedPxPerSec] = useState(28);
  const [useBpmSpeed, setUseBpmSpeed] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useWakeLock(true);

  const items = q.data?.items ?? [];
  const current = items[index];
  const title = q.data?.setlist.title ?? '';
  const bpm = current?.song.tempo;

  const go = useCallback(
    (dir: -1 | 1) => {
      setIndex((i) => {
        const n = i + dir;
        if (n < 0) return 0;
        if (n >= items.length) return Math.max(0, items.length - 1);
        return n;
      });
    },
    [items.length],
  );

  useEffect(() => {
    setIndex(0);
  }, [setlistId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') navigate(studioSetlistDetailPath(surface, setlistId));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, navigate, setlistId, surface]);

  const pxPerSec = useBpmSpeed && bpm ? Math.max(12, Math.min(80, (bpm / 60) * 14)) : speedPxPerSec;

  useEffect(() => {
    if (!autoScroll) {
      lastTsRef.current = null;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const loop = (t: number) => {
      const el = scrollRef.current;
      if (el && lastTsRef.current != null) {
        const dt = (t - lastTsRef.current) / 1000;
        el.scrollTop += pxPerSec * dt;
      }
      lastTsRef.current = t;
      rafRef.current = requestAnimationFrame(loop);
    };
    lastTsRef.current = null;
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [autoScroll, pxPerSec]);

  if (q.isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-black text-zinc-500">
        Загрузка…
      </div>
    );
  }
  if (!q.data || items.length === 0) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-black text-zinc-400">
        <p>В сетлисте нет песен.</p>
        <button
          type="button"
          onClick={() => navigate(studioSetlistDetailPath(surface, setlistId))}
          className="text-sky-400"
        >
          Назад
        </button>
      </div>
    );
  }

  const body = current ? current.effective_content || current.song.content : '';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-zinc-100"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null) return;
        const dx = end - start;
        if (dx > 60) go(-1);
        if (dx < -60) go(1);
      }}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-2 py-2">
        <button
          type="button"
          onClick={() => navigate(studioSetlistDetailPath(surface, setlistId))}
          className="flex h-10 w-10 shrink-0 items-center justify-center text-zinc-400"
          aria-label="Закрыть"
        >
          <LuX className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 px-2 text-center">
          <p className="truncate text-xs text-zinc-500">{title}</p>
          <div className="flex items-center justify-center gap-2">
            <p className="truncate text-sm font-semibold text-white">{current?.song.title}</p>
            {bpm ? (
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                style={{
                  animation: `perform-bpm-pulse ${60 / bpm}s ease-in-out infinite`,
                }}
                title={`${bpm} BPM`}
              />
            ) : null}
          </div>
        </div>
        <span className="w-10 shrink-0 text-right text-xs text-zinc-500">
          {index + 1}/{items.length}
        </span>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs">
        <span className="text-zinc-500">Трансп.</span>
        <button
          type="button"
          className="rounded-lg bg-zinc-900 px-2 py-1"
          onClick={() => setTranspose((t) => Math.max(t - 1, -11))}
        >
          <LuMinus className="h-4 w-4" />
        </button>
        <span className="w-8 text-center font-mono">{transpose}</span>
        <button
          type="button"
          className="rounded-lg bg-zinc-900 px-2 py-1"
          onClick={() => setTranspose((t) => Math.min(t + 1, 11))}
          aria-label="Выше"
        >
          <LuPlus className="h-4 w-4" />
        </button>
        <div className="mx-1 h-4 w-px bg-zinc-700" />
        <button
          type="button"
          onClick={() => setAutoScroll((a) => !a)}
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium ${
            autoScroll ? 'bg-emerald-700 text-white' : 'bg-zinc-900 text-zinc-300'
          }`}
        >
          {autoScroll ? <LuPause className="h-4 w-4" /> : <LuPlay className="h-4 w-4" />}
          Автоскролл
        </button>
        <label className="flex cursor-pointer items-center gap-1 text-zinc-400">
          <input
            type="checkbox"
            checked={useBpmSpeed}
            onChange={(e) => setUseBpmSpeed(e.target.checked)}
            disabled={!bpm}
          />
          по BPM
        </label>
        <input
          type="range"
          min={8}
          max={72}
          value={speedPxPerSec}
          onChange={(e) => setSpeedPxPerSec(Number(e.target.value))}
          disabled={useBpmSpeed && Boolean(bpm)}
          className="h-1 w-24 accent-emerald-500"
        />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <LyricsWithChords
          text={body}
          transposeSemitones={transpose}
          chordTone="dark"
          className="font-sans text-lg text-zinc-100 md:text-xl"
        />
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-zinc-800 p-4">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index <= 0}
          className="flex h-14 flex-1 items-center justify-center rounded-xl bg-zinc-900 text-white disabled:opacity-30"
        >
          <LuChevronLeft className="h-8 w-8" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index >= items.length - 1}
          className="flex h-14 flex-1 items-center justify-center rounded-xl bg-zinc-900 text-white disabled:opacity-30"
        >
          <LuChevronRight className="h-8 w-8" />
        </button>
      </footer>

      <style>{`
        @keyframes perform-bpm-pulse {
          0%, 100% { opacity: 0.35; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}
