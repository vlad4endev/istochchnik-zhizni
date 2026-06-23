import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import {
  LuChevronLeft,
  LuChevronRight,
  LuEye,
  LuEyeOff,
  LuMaximize2,
  LuMinus,
  LuMoon,
  LuNotebookPen,
  LuPause,
  LuPlay,
  LuPlus,
  LuSettings2,
  LuSun,
  LuX,
} from 'react-icons/lu';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useWakeLock } from '../../../hooks/useWakeLock';
import { transposeChordSymbol } from '../../songbook/chordUtils';
import { LyricsWithMusicianNotes } from '../components/LyricsWithMusicianNotes';
import { fetchPerformance } from '../api';
import { notesFromItem } from '../performNotes';
import { studioSetlistDetailPath, useStudioModuleSurface } from '../studioPaths';
import { usePerformStagePreferences } from '../usePerformStagePreferences';
import { SkeletonBox } from '@/components/ui/SkeletonBox';

function parseStartSongIndex(raw: string | null, max: number): number {
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 0;
  return Math.min(n - 1, Math.max(0, max - 1));
}

export function PerformPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const setlistId = Number(id);
  const navigate = useNavigate();
  const surface = useStudioModuleSurface();
  const q = useQuery({
    queryKey: ['studio', 'perform', setlistId],
    queryFn: () => fetchPerformance(setlistId),
    enabled: Number.isInteger(setlistId) && setlistId > 0,
  });

  const { prefs, update } = usePerformStagePreferences();
  const [index, setIndex] = useState(0);
  const [transpose, setTranspose] = useState(0);
  const [autoScroll, setAutoScroll] = useState(false);
  const [speedPxPerSec, setSpeedPxPerSec] = useState(28);
  const [useBpmSpeed, setUseBpmSpeed] = useState(true);
  const [controlsOpen, setControlsOpen] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const initialSongApplied = useRef(false);

  useWakeLock(true);

  const items = q.data?.items ?? [];
  const current = items[index];
  const nextItem = index < items.length - 1 ? items[index + 1] : null;
  const title = q.data?.setlist.title ?? '';
  const bpm = current?.song.tempo;
  const stageDark = prefs.stageDark;

  const baseKey = current?.effective_key ?? current?.song.default_key ?? null;
  const displayKey =
    baseKey && transpose !== 0 ? transposeChordSymbol(baseKey, transpose) : baseKey;

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

  const jumpTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= items.length) return;
      setIndex(i);
    },
    [items.length],
  );

  useEffect(() => {
    setIndex(0);
    initialSongApplied.current = false;
  }, [setlistId]);

  useEffect(() => {
    if (!q.data || items.length === 0 || initialSongApplied.current) return;
    const start = parseStartSongIndex(searchParams.get('song'), items.length);
    if (start > 0) setIndex(start);
    initialSongApplied.current = true;
  }, [q.data, items.length, searchParams]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    setAutoScroll(false);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        go(1);
      }
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') navigate(studioSetlistDetailPath(surface, setlistId));
      if (e.key === 'f' || e.key === 'F') update({ focusMode: !prefs.focusMode });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, navigate, prefs.focusMode, setlistId, surface, update]);

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

  const handleTouchSwipe = (e: TouchEvent) => {
    if (e.type === 'touchstart') {
      touchStartX.current = e.touches[0]?.clientX ?? null;
      touchStartY.current = e.touches[0]?.clientY ?? null;
      return;
    }
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    const endX = e.changedTouches[0]?.clientX;
    const endY = e.changedTouches[0]?.clientY;
    if (startX == null || endX == null || startY == null || endY == null) return;
    const dx = endX - startX;
    const dy = endY - startY;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx > 0) go(-1);
    if (dx < 0) go(1);
  };

  if (q.isLoading) {
    return (
      <div className="perform-stage flex min-h-[var(--viewport-height,100dvh)] items-center justify-center px-4">
        <div className="w-full max-w-3xl space-y-3">
          <SkeletonBox width="32%" height="20px" />
          <SkeletonBox width="100%" height="14px" />
          <SkeletonBox width="88%" height="14px" />
        </div>
      </div>
    );
  }

  if (!q.data || items.length === 0) {
    return (
      <div className="perform-stage flex min-h-[var(--viewport-height,100dvh)] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="perform-stage-muted">В сетлисте нет песен. Добавьте их в редакторе сетлиста.</p>
        <button
          type="button"
          onClick={() => navigate(studioSetlistDetailPath(surface, setlistId))}
          className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          К сетлисту
        </button>
      </div>
    );
  }

  const body = current ? current.effective_content || current.song.content : '';
  const focusMode = prefs.focusMode;

  const shellClass = stageDark
    ? 'perform-stage'
    : 'bg-[var(--surface)] text-[var(--text)]';
  const barClass = stageDark
    ? 'perform-stage-surface border-[var(--perform-border)]'
    : 'border-[var(--border)] bg-[var(--surface-elevated)]/90';
  const mutedClass = stageDark ? 'perform-stage-muted' : 'text-[var(--text-muted)]';
  const textClass = stageDark ? 'text-[var(--perform-text)]' : 'text-[var(--text)]';
  const lyricsBg = stageDark ? 'bg-[var(--perform-bg)]' : 'bg-[var(--bg-elevated)]';

  return (
    <div
      className={`fixed inset-0 z-[var(--z-perform)] flex max-h-[var(--viewport-height,100dvh)] min-h-0 flex-col ${shellClass}`}
      onTouchStart={handleTouchSwipe}
      onTouchEnd={handleTouchSwipe}
    >
      <header
        className={`flex shrink-0 items-center gap-2 border-b px-2 py-2 backdrop-blur-sm ${barClass}`}
      >
        <button
          type="button"
          onClick={() => navigate(studioSetlistDetailPath(surface, setlistId))}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${mutedClass} hover:opacity-80`}
          aria-label="Закрыть"
        >
          <LuX className="h-6 w-6" />
        </button>

        <div className="min-w-0 flex-1 text-center">
          {!focusMode ? (
            <p className={`truncate text-xs ${mutedClass}`}>{title}</p>
          ) : null}
          <div className="flex items-center justify-center gap-2">
            <p
              className={`truncate font-bold ${textClass} ${focusMode ? 'text-lg md:text-xl' : 'text-base'}`}
            >
              {current?.song.title}
            </p>
            {bpm ? (
              <span
                className="bpm-pulse inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400"
                style={{ '--bpm-duration': `${60 / bpm}s` } as CSSProperties}
                title={`${bpm} BPM`}
              />
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {displayKey ? (
            <span
              className={`hidden rounded-lg px-2 py-1 font-mono text-sm font-bold sm:inline ${
                stageDark ? 'bg-emerald-900/50 text-emerald-300' : 'bg-emerald-100 text-emerald-800'
              }`}
              title="Тональность"
            >
              {displayKey}
              {transpose !== 0 ? (
                <span className={`ml-1 text-xs font-normal ${mutedClass}`}>
                  ({transpose > 0 ? '+' : ''}
                  {transpose})
                </span>
              ) : null}
            </span>
          ) : null}
          <span className={`w-10 text-right text-xs font-semibold ${mutedClass}`}>
            {index + 1}/{items.length}
          </span>
          <button
            type="button"
            onClick={() => update({ focusMode: !focusMode })}
            className={`flex h-11 w-11 items-center justify-center rounded-xl ${mutedClass} hover:opacity-80`}
            aria-label={focusMode ? 'Показать панель' : 'Режим сцены'}
            title={focusMode ? 'Показать панель (F)' : 'Режим сцены — только текст (F)'}
          >
            <LuMaximize2 className="h-5 w-5" />
          </button>
        </div>
      </header>

      {!focusMode && displayKey ? (
        <div
          className={`flex shrink-0 items-center justify-center gap-3 border-b px-3 py-2 sm:hidden ${barClass}`}
        >
          <span
            className={`rounded-xl px-4 py-1.5 font-mono text-lg font-bold ${
              stageDark ? 'bg-emerald-900/50 text-emerald-300' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {displayKey}
          </span>
          {bpm ? <span className={`text-sm font-medium ${mutedClass}`}>{bpm} BPM</span> : null}
        </div>
      ) : null}

      {!focusMode ? (
        <div className={`shrink-0 border-b ${barClass}`}>
          <button
            type="button"
            onClick={() => setControlsOpen((o) => !o)}
            className={`flex w-full items-center justify-center gap-2 px-3 py-2 text-xs font-semibold ${mutedClass}`}
          >
            <LuSettings2 className="h-4 w-4" />
            {controlsOpen ? 'Скрыть настройки' : 'Транспонирование и автоскролл'}
          </button>
          {controlsOpen ? (
            <div
              className={`flex flex-wrap items-center gap-2 border-t px-3 py-2 text-xs ${stageDark ? 'border-[var(--perform-border)]' : 'border-[var(--border)]'}`}
            >
              <span className={mutedClass}>Трансп.</span>
              <button
                type="button"
                className={`rounded-lg border px-2.5 py-1.5 ${barClass}`}
                onClick={() => setTranspose((t) => Math.max(t - 1, -11))}
                aria-label="Ниже"
              >
                <LuMinus className="h-4 w-4" />
              </button>
              <span className={`w-8 text-center font-mono font-bold ${textClass}`}>{transpose}</span>
              <button
                type="button"
                className={`rounded-lg border px-2.5 py-1.5 ${barClass}`}
                onClick={() => setTranspose((t) => Math.min(t + 1, 11))}
                aria-label="Выше"
              >
                <LuPlus className="h-4 w-4" />
              </button>
              <div className={`mx-1 h-5 w-px ${stageDark ? 'bg-white/10' : 'bg-[var(--border)]'}`} />
              <button
                type="button"
                onClick={() => setAutoScroll((a) => !a)}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-semibold ${
                  autoScroll
                    ? 'bg-emerald-600 text-white'
                    : `border ${barClass}`
                }`}
              >
                {autoScroll ? <LuPause className="h-4 w-4" /> : <LuPlay className="h-4 w-4" />}
                Автоскролл
              </button>
              <label className={`flex cursor-pointer items-center gap-1 ${mutedClass}`}>
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
                className="h-1 w-20 accent-emerald-500"
              />
              <div className={`mx-1 h-5 w-px ${stageDark ? 'bg-white/10' : 'bg-[var(--border)]'}`} />
              <span className={mutedClass}>Текст</span>
              <button
                type="button"
                className={`rounded-lg border px-2.5 py-1.5 ${barClass}`}
                onClick={() => update({ fontSize: Math.max(14, prefs.fontSize - 2) })}
                aria-label="Мельче"
              >
                <LuMinus className="h-4 w-4" />
              </button>
              <span className={`w-7 text-center font-mono text-xs ${textClass}`}>{prefs.fontSize}</span>
              <button
                type="button"
                className={`rounded-lg border px-2.5 py-1.5 ${barClass}`}
                onClick={() => update({ fontSize: Math.min(44, prefs.fontSize + 2) })}
                aria-label="Крупнее"
              >
                <LuPlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => update({ chordsVisible: !prefs.chordsVisible })}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ${barClass}`}
                title={prefs.chordsVisible ? 'Скрыть аккорды' : 'Показать аккорды'}
              >
                {prefs.chordsVisible ? <LuEye className="h-4 w-4" /> : <LuEyeOff className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => update({ musicianNotesVisible: !prefs.musicianNotesVisible })}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ${
                  prefs.musicianNotesVisible ? `${barClass} text-violet-600` : barClass
                }`}
                title={prefs.musicianNotesVisible ? 'Скрыть заметки' : 'Показать заметки'}
              >
                <LuNotebookPen className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => update({ stageDark: !prefs.stageDark })}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ${barClass}`}
                title={stageDark ? 'Светлая тема' : 'Тёмная тема для сцены'}
              >
                {stageDark ? <LuSun className="h-4 w-4" /> : <LuMoon className="h-4 w-4" />}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <button
          type="button"
          className="perform-edge-nav perform-edge-nav--left"
          onClick={() => go(-1)}
          disabled={index <= 0}
          aria-label="Предыдущая песня"
        />
        <button
          type="button"
          className="perform-edge-nav perform-edge-nav--right"
          onClick={() => go(1)}
          disabled={index >= items.length - 1}
          aria-label="Следующая песня"
        />

        <div
          ref={scrollRef}
          className={`h-full overflow-auto px-4 py-5 md:px-8 md:py-6 ${lyricsBg}`}
        >
          <LyricsWithMusicianNotes
            content={body}
            notes={notesFromItem(current?.musician_notes)}
            transposeSemitones={transpose}
            chordTone={stageDark ? 'dark' : 'light'}
            stageDark={stageDark}
            fontSizePx={prefs.fontSize}
            chordsVisible={prefs.chordsVisible}
            notesVisible={prefs.musicianNotesVisible}
            className="mx-auto max-w-3xl font-sans leading-relaxed"
          />
        </div>
      </div>

      <div
        className={`shrink-0 overflow-x-auto border-t px-2 py-2 ${barClass}`}
        role="tablist"
        aria-label="Песни сетлиста"
      >
        <div className="flex min-w-min gap-1.5">
          {items.map((it, i) => {
            const active = i === index;
            return (
              <button
                key={it.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => jumpTo(i)}
                className={[
                  'max-w-[9rem] shrink-0 truncate rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition',
                  active
                    ? stageDark
                      ? 'perform-song-strip-btn--active'
                      : 'border-emerald-500 bg-emerald-600 text-white'
                    : stageDark
                      ? 'perform-stage-surface border-[var(--perform-border)] text-[var(--perform-muted)] hover:text-[var(--perform-text)]'
                      : 'border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
                ].join(' ')}
              >
                <span className="mr-1 opacity-70">{i + 1}.</span>
                {it.song.title}
              </button>
            );
          })}
        </div>
      </div>

      <footer
        className={`flex shrink-0 items-stretch gap-2 border-t p-3 backdrop-blur-sm ${barClass}`}
      >
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index <= 0}
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border disabled:opacity-30 ${barClass}`}
          aria-label="Предыдущая"
        >
          <LuChevronLeft className="h-8 w-8" />
        </button>

        <div className="flex min-w-0 flex-1 flex-col justify-center px-1 text-center">
          {nextItem ? (
            <>
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                Далее
              </p>
              <p className={`truncate text-sm font-semibold ${textClass}`}>{nextItem.song.title}</p>
            </>
          ) : (
            <p className={`text-sm font-medium ${mutedClass}`}>Конец программы</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => go(1)}
          disabled={index >= items.length - 1}
          className={`flex h-14 min-w-[3.5rem] flex-1 items-center justify-center gap-1 rounded-xl border font-semibold disabled:opacity-30 ${
            stageDark
              ? 'border-emerald-700/50 bg-emerald-900/40 text-emerald-100'
              : 'border-emerald-300 bg-emerald-50 text-emerald-900'
          }`}
        >
          <span className="hidden sm:inline">Следующая</span>
          <LuChevronRight className="h-8 w-8" />
        </button>
      </footer>
    </div>
  );
}
