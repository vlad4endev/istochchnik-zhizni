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
import { LyricsWithMusicianNotes } from '../components/LyricsWithMusicianNotes';
import { fetchPerformance } from '../api';
import { notesFromItem } from '../performNotes';
import { studioSetlistDetailPath, useStudioModuleSurface } from '../studioPaths';
import { SkeletonBox } from '@/components/ui/SkeletonBox';

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
      <div className="flex min-h-[100dvh] items-center justify-center bg-stone-100 px-4">
        <div className="w-full max-w-3xl space-y-3">
          <SkeletonBox width="32%" height="20px" />
          <SkeletonBox width="100%" height="14px" />
          <SkeletonBox width="88%" height="14px" />
          <SkeletonBox width="74%" height="14px" />
        </div>
      </div>
    );
  }
  if (!q.data || items.length === 0) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-stone-100 px-4 text-center text-stone-600">
        <p>В сетлисте нет песен. Добавьте их в редакторе сетлиста.</p>
        <button
          type="button"
          onClick={() => navigate(studioSetlistDetailPath(surface, setlistId))}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
        >
          К сетлисту
        </button>
      </div>
    );
  }

  const body = current ? current.effective_content || current.song.content : '';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-stone-100 text-stone-900"
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
      <header className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white/90 px-2 py-2 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => navigate(studioSetlistDetailPath(surface, setlistId))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          aria-label="Закрыть"
        >
          <LuX className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 px-2 text-center">
          <p className="truncate text-xs text-stone-500">{title}</p>
          <div className="flex items-center justify-center gap-2">
            <p className="truncate text-sm font-semibold text-stone-900">{current?.song.title}</p>
            {bpm ? (
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                style={{
                  animation: `perform-bpm-pulse ${60 / bpm}s ease-in-out infinite`,
                }}
                title={`${bpm} BPM`}
              />
            ) : null}
          </div>
        </div>
        <span className="w-10 shrink-0 text-right text-xs font-medium text-stone-500">
          {index + 1}/{items.length}
        </span>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-200 bg-white/80 px-3 py-2 text-xs backdrop-blur-sm">
        <span className="text-stone-500">Трансп.</span>
        <button
          type="button"
          className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-stone-800 hover:bg-stone-100"
          onClick={() => setTranspose((t) => Math.max(t - 1, -11))}
        >
          <LuMinus className="h-4 w-4" />
        </button>
        <span className="w-8 text-center font-mono font-semibold text-stone-900">{transpose}</span>
        <button
          type="button"
          className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-stone-800 hover:bg-stone-100"
          onClick={() => setTranspose((t) => Math.min(t + 1, 11))}
          aria-label="Выше"
        >
          <LuPlus className="h-4 w-4" />
        </button>
        <div className="mx-1 h-4 w-px bg-stone-200" />
        <button
          type="button"
          onClick={() => setAutoScroll((a) => !a)}
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-semibold ${
            autoScroll ? 'bg-emerald-600 text-white shadow-sm' : 'border border-stone-200 bg-white text-stone-700'
          }`}
        >
          {autoScroll ? <LuPause className="h-4 w-4" /> : <LuPlay className="h-4 w-4" />}
          Автоскролл
        </button>
        <label className="flex cursor-pointer items-center gap-1 text-stone-600">
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
          className="h-1 w-24 accent-emerald-600"
        />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-stone-50 px-4 py-5">
        <LyricsWithMusicianNotes
          content={body}
          notes={notesFromItem(current?.musician_notes)}
          transposeSemitones={transpose}
          chordTone="light"
          className="font-sans text-lg text-stone-900 md:text-xl"
        />
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-stone-200 bg-white/95 p-4 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index <= 0}
          className="flex h-14 flex-1 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-900 shadow-sm hover:bg-stone-50 disabled:opacity-30"
        >
          <LuChevronLeft className="h-8 w-8" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index >= items.length - 1}
          className="flex h-14 flex-1 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-900 shadow-sm hover:bg-stone-50 disabled:opacity-30"
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
