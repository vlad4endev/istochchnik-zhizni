import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import {
  LuChevronLeft,
  LuChevronRight,
  LuEye,
  LuEyeOff,
  LuMaximize2,
  LuMinimize2,
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
      if (e.key === 'c' || e.key === 'C') update({ chordsVisible: !prefs.chordsVisible });
      if (e.key === '+' || e.key === '=') update({ fontSize: Math.min(48, prefs.fontSize + 2) });
      if (e.key === '-' || e.key === '_') update({ fontSize: Math.max(14, prefs.fontSize - 2) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, navigate, prefs.chordsVisible, prefs.focusMode, prefs.fontSize, setlistId, surface, update]);

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
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
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
    : 'border-[var(--border)] bg-[var(--surface-elevated)]/95';
  const mutedClass = stageDark ? 'perform-stage-muted' : 'text-[var(--text-muted)]';
  const textClass = stageDark ? 'text-[var(--perform-text)]' : 'text-[var(--text)]';
  const lyricsBg = stageDark ? 'bg-[var(--perform-bg)]' : 'bg-[var(--bg-elevated)]';
  const keyBadgeClass = stageDark
    ? 'bg-emerald-900/55 text-emerald-200'
    : 'bg-emerald-100 text-emerald-900';

  return (
    <div
      className={`fixed inset-0 z-[var(--z-perform)] flex max-h-[var(--viewport-height,100dvh)] min-h-0 flex-col ${shellClass}`}
      onTouchStart={handleTouchSwipe}
      onTouchEnd={handleTouchSwipe}
    >
      <header
        className={`flex shrink-0 items-center gap-1.5 border-b px-1.5 py-1.5 backdrop-blur-sm sm:gap-2 sm:px-2 sm:py-2 ${barClass}`}
      >
        <button
          type="button"
          onClick={() => navigate(studioSetlistDetailPath(surface, setlistId))}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${mutedClass} hover:opacity-80`}
          aria-label="Закрыть"
        >
          <LuX className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>

        <div className="min-w-0 flex-1 text-center">
          {!focusMode ? (
            <p className={`truncate text-[10px] sm:text-xs ${mutedClass}`}>{title}</p>
          ) : null}
          <div className="flex items-center justify-center gap-1.5 sm:gap-2">
            <p
              className={`truncate font-bold leading-tight ${textClass} ${
                focusMode ? 'text-base sm:text-xl' : 'text-sm sm:text-base'
              }`}
            >
              {current?.song.title}
            </p>
            {bpm ? (
              <span
                className="bpm-pulse inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400 sm:h-2.5 sm:w-2.5"
                style={{ '--bpm-duration': `${60 / bpm}s` } as CSSProperties}
                title={`${bpm} BPM`}
              />
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {displayKey ? (
            <span
              className={`rounded-lg px-1.5 py-1 font-mono text-xs font-bold sm:px-2 sm:text-sm ${keyBadgeClass}`}
              title="Тональность"
            >
              {displayKey}
              {transpose !== 0 ? (
                <span className={`ml-0.5 text-[10px] font-normal ${mutedClass}`}>
                  {transpose > 0 ? '+' : ''}
                  {transpose}
                </span>
              ) : null}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => update({ chordsVisible: !prefs.chordsVisible })}
            className={`flex h-10 w-10 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${
              prefs.chordsVisible
                ? stageDark
                  ? 'text-emerald-300'
                  : 'text-emerald-700'
                : mutedClass
            } hover:opacity-80`}
            aria-label={prefs.chordsVisible ? 'Скрыть аккорды' : 'Показать аккорды'}
            title="Аккорды (C)"
          >
            {prefs.chordsVisible ? <LuEye className="h-5 w-5" /> : <LuEyeOff className="h-5 w-5" />}
          </button>
          <span className={`hidden w-9 text-right text-xs font-semibold sm:inline ${mutedClass}`}>
            {index + 1}/{items.length}
          </span>
          <button
            type="button"
            onClick={() => update({ focusMode: !focusMode })}
            className={`flex h-10 w-10 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${mutedClass} hover:opacity-80`}
            aria-label={focusMode ? 'Показать панель' : 'Режим сцены'}
            title={focusMode ? 'Показать панель (F)' : 'Только текст (F)'}
          >
            {focusMode ? <LuMinimize2 className="h-5 w-5" /> : <LuMaximize2 className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {!focusMode ? (
        <div className={`shrink-0 border-b ${barClass}`}>
          <button
            type="button"
            onClick={() => setControlsOpen((o) => !o)}
            className={`flex w-full items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold sm:py-2 ${mutedClass}`}
          >
            <LuSettings2 className="h-4 w-4" />
            {controlsOpen ? 'Скрыть настройки' : 'Транспонирование · размер · автоскролл'}
          </button>
          {controlsOpen ? (
            <div
              className={`flex flex-wrap items-center gap-2 border-t px-2 py-2 text-xs sm:px-3 ${stageDark ? 'border-[var(--perform-border)]' : 'border-[var(--border)]'}`}
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
                  autoScroll ? 'bg-emerald-600 text-white' : `border ${barClass}`
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
                onClick={() => update({ fontSize: Math.min(48, prefs.fontSize + 2) })}
                aria-label="Крупнее"
              >
                <LuPlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => update({ musicianNotesVisible: !prefs.musicianNotesVisible })}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ${
                  prefs.musicianNotesVisible
                    ? stageDark
                      ? `${barClass} text-violet-300`
                      : `${barClass} text-violet-700`
                    : barClass
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
      ) : (
        <div
          className={`flex shrink-0 items-center justify-center gap-2 border-b px-2 py-1 ${barClass}`}
        >
          <button
            type="button"
            className={`rounded-lg border px-2 py-1 ${barClass}`}
            onClick={() => update({ fontSize: Math.max(14, prefs.fontSize - 2) })}
            aria-label="Мельче"
          >
            <LuMinus className="h-3.5 w-3.5" />
          </button>
          <span className={`font-mono text-xs ${mutedClass}`}>{prefs.fontSize}px</span>
          <button
            type="button"
            className={`rounded-lg border px-2 py-1 ${barClass}`}
            onClick={() => update({ fontSize: Math.min(48, prefs.fontSize + 2) })}
            aria-label="Крупнее"
          >
            <LuPlus className="h-3.5 w-3.5" />
          </button>
          {bpm ? <span className={`text-xs ${mutedClass}`}>{bpm} BPM</span> : null}
          <span className={`text-xs font-semibold ${mutedClass}`}>
            {index + 1}/{items.length}
          </span>
        </div>
      )}

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
          className={`perform-lyrics-scroll h-full overflow-auto py-4 sm:px-6 sm:py-6 md:px-10 ${lyricsBg}`}
        >
          <div className="perform-lyrics-inner px-3 sm:px-0">
            <LyricsWithMusicianNotes
              content={body}
              notes={notesFromItem(current?.musician_notes)}
              transposeSemitones={transpose}
              chordTone={stageDark ? 'dark' : 'light'}
              stageDark={stageDark}
              fontSizePx={prefs.fontSize}
              chordsVisible={prefs.chordsVisible}
              notesVisible={prefs.musicianNotesVisible && !focusMode}
              className="font-sans"
            />
          </div>
        </div>
      </div>

      {!focusMode ? (
        <div
          className={`shrink-0 overflow-x-auto border-t px-2 pt-1.5 pb-1 sm:pt-2 ${barClass}`}
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
                    'max-w-[8.5rem] shrink-0 truncate rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition sm:max-w-[9rem] sm:px-2.5 sm:py-2 sm:text-xs',
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
      ) : null}

      <footer
        className={`perform-compact-footer flex shrink-0 items-stretch gap-2 border-t px-2 py-2 backdrop-blur-sm sm:gap-2 sm:p-3 ${barClass}`}
      >
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index <= 0}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border disabled:opacity-30 sm:h-14 sm:w-14 ${barClass}`}
          aria-label="Предыдущая"
        >
          <LuChevronLeft className="h-7 w-7 sm:h-8 sm:w-8" />
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
          className={`flex h-12 min-w-[3rem] flex-1 items-center justify-center gap-1 rounded-xl border font-semibold disabled:opacity-30 sm:h-14 sm:min-w-[3.5rem] ${
            stageDark
              ? 'border-emerald-700/50 bg-emerald-900/40 text-emerald-100'
              : 'border-emerald-300 bg-emerald-50 text-emerald-900'
          }`}
        >
          <span className="hidden sm:inline">Следующая</span>
          <LuChevronRight className="h-7 w-7 sm:h-8 sm:w-8" />
        </button>
      </footer>
    </div>
  );
}
