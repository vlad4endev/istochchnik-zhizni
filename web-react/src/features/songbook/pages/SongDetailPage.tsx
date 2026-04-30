import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft, LuPlus, LuMinus, LuSettings2 } from 'react-icons/lu';

import { dispatchLayoutMainChrome } from '../../../app/layoutChrome';
import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { keys } from '@/lib/queryKeys';
import { useAuthStore } from '../../auth/authStore';
import { canAccessStudioRole } from '../../auth/studioAccess';
import { useWakeLock } from '../../../hooks/useWakeLock';
import { fetchSong, recordSongOpened } from '../api';
import { transposeChordSymbol } from '../chordUtils';
import { LyricsWithChords } from '../components/LyricsWithChords';
import { SongReaderSettings } from '../components/SongReaderSettings';
import { useSongbookChrome } from '../SongbookChromeContext';
import { fetchVersionForSong } from '../../studio/api';

export function SongDetailPage() {
  const { id } = useParams<{ id: string }>();
  const songId = Number(id);
  const role = useAuthStore((s) => s.role);
  const studioOk = canAccessStudioRole(role);
  const token = useAuthStore((s) => s.token);
  const { stageMode, toggleStageMode } = useSongbookChrome();
  const [transpose, setTranspose] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeedLevel, setScrollSpeedLevel] = useState(2);
  const [fontSize, setFontSize] = useState(16);
  const [capo, setCapo] = useState(0);
  const [showConcertChords, setShowConcertChords] = useState(false);
  const [chordLayoutMode, setChordLayoutMode] = useState<'mono' | 'measured'>('mono');
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [topOffset, setTopOffset] = useState(118);
  const resumeAutoscrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeAutoscrollWantedRef = useRef(false);
  const topBarRef = useRef<HTMLDivElement | null>(null);

  const q = useQuery({
    queryKey: keys.song(songId),
    queryFn: () => fetchSong(songId),
    enabled: Number.isInteger(songId) && songId > 0,
    staleTime: 5 * 60_000,
  });
  const versionQ = useQuery({
    queryKey: ['studio', 'version', songId],
    queryFn: () => fetchVersionForSong(songId),
    enabled: studioOk && Number.isInteger(songId) && songId > 0,
  });

  useWakeLock(true);

  useEffect(() => {
    if (!token || !Number.isInteger(songId) || songId <= 0) return;
    void recordSongOpened(songId).catch(() => {});
  }, [token, songId]);

  const scrollSpeedPxPerSec = 20 + (Math.max(1, Math.min(10, scrollSpeedLevel)) - 1) * 20;

  const stopAutoScroll = () => {
    resumeAutoscrollWantedRef.current = false;
    if (resumeAutoscrollTimeoutRef.current) {
      clearTimeout(resumeAutoscrollTimeoutRef.current);
      resumeAutoscrollTimeoutRef.current = null;
    }
    setAutoScroll(false);
  };

  const startAutoScroll = () => {
    resumeAutoscrollWantedRef.current = false;
    if (resumeAutoscrollTimeoutRef.current) {
      clearTimeout(resumeAutoscrollTimeoutRef.current);
      resumeAutoscrollTimeoutRef.current = null;
    }
    setAutoScroll(true);
  };

  const pauseAutoScrollByUser = () => {
    if (!autoScroll) return;
    setAutoScroll(false);
    resumeAutoscrollWantedRef.current = true;
    if (resumeAutoscrollTimeoutRef.current) {
      clearTimeout(resumeAutoscrollTimeoutRef.current);
      resumeAutoscrollTimeoutRef.current = null;
    }
    resumeAutoscrollTimeoutRef.current = setTimeout(() => {
      if (!resumeAutoscrollWantedRef.current) return;
      setAutoScroll(true);
      resumeAutoscrollTimeoutRef.current = null;
    }, 3000);
  };

  /** Режим «чистого чтения»: при прокрутке вниз скрываем основной хром приложения. */
  useEffect(() => {
    const isMobileViewport = () =>
      typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

    if (fullscreen) {
      dispatchLayoutMainChrome(false);
      return () => dispatchLayoutMainChrome(true);
    }

    if (!isMobileViewport()) {
      dispatchLayoutMainChrome(true);
      return;
    }

    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      const visible = y < 56;
      dispatchLayoutMainChrome(visible);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      dispatchLayoutMainChrome(true);
    };
  }, [fullscreen]);

  useEffect(() => {
    if (!autoScroll) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const bpmFactor = q.data?.tempo ? Math.max(0.65, Math.min(2.4, Number(q.data.tempo) / 80)) : 1;
      window.scrollBy(0, scrollSpeedPxPerSec * bpmFactor * dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoScroll, scrollSpeedPxPerSec, q.data?.tempo]);

  useEffect(() => {
    const updateProgress = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const current = Math.max(0, Math.min(maxScroll, window.scrollY || document.documentElement.scrollTop));
      setScrollProgress(current / maxScroll);
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    return () => {
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
    };
  }, []);

  useEffect(() => {
    if (fullscreen) return;
    const node = topBarRef.current;
    if (!node) return;

    const updateOffset = () => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      if (next > 0) setTopOffset(next);
    };
    updateOffset();

    const observer = new ResizeObserver(() => updateOffset());
    observer.observe(node);
    window.addEventListener('resize', updateOffset);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateOffset);
    };
  }, [fullscreen]);

  useEffect(() => {
    const onWheel = () => pauseAutoScrollByUser();
    const onTouchMove = () => pauseAutoScrollByUser();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp' || e.key === ' ') {
        pauseAutoScrollByUser();
      }
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [autoScroll]);

  useEffect(() => {
    if (!autoScroll) return;
    return () => {
      if (resumeAutoscrollTimeoutRef.current) {
        clearTimeout(resumeAutoscrollTimeoutRef.current);
        resumeAutoscrollTimeoutRef.current = null;
      }
    };
  }, [autoScroll]);

  if (!Number.isInteger(songId) || songId <= 0) {
    return <p className="text-red-600">Некорректная ссылка</p>;
  }
  if (q.isLoading) return <SongListSkeleton />;
  if (q.isError || !q.data) return <p className="text-red-600">Песня не найдена</p>;

  const s = q.data;
  const version = (versionQ.data as { custom_content?: string | null; custom_key?: string | null } | null) ?? null;
  const effectiveContent = version?.custom_content ?? s.content;
  const effectiveKey = version?.custom_key ?? s.default_key;
  const currentShift = showChords
    ? showConcertChords
      ? transpose
      : transpose - capo
    : 0;
  const transposedKey = effectiveKey ? transposeChordSymbol(effectiveKey, currentShift) : null;
  const keyLabel = effectiveKey
    ? `${effectiveKey} \u2192 ${transposedKey ?? effectiveKey}`
    : currentShift === 0
      ? 'Тональность: без сдвига'
      : `Тональность: сдвиг ${currentShift > 0 ? '+' : ''}${currentShift}`;

  const shell = {
    page: 'text-stone-900',
    top: 'border-stone-200 bg-[var(--surface)]/95',
    title: 'text-stone-900',
    meta: 'text-stone-500',
    card: 'border border-stone-200 bg-white',
    settingsBtn: 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
  };

  return (
    <div className={`relative mx-auto max-w-3xl pb-24 ${shell.page}`}>
      <div className="fixed inset-x-0 top-0 z-[55] h-1 bg-stone-200/70">
        <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${scrollProgress * 100}%` }} />
      </div>
      <div
        ref={topBarRef}
        className={['fixed inset-x-0 top-0 z-40 border-b backdrop-blur', shell.top, fullscreen ? 'hidden' : ''].join(' ')}
      >
        <div className="mx-auto max-w-3xl px-3 py-2 md:px-0">
          <div className="mb-1 flex min-w-0 items-center gap-2">
            <Link
              to="/songbook"
              className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[12px] text-stone-500 hover:bg-stone-100"
              aria-label="Назад к списку"
            >
              <LuArrowLeft className="h-4 w-4" />
              <span>Назад</span>
            </Link>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className={`truncate text-[20px] font-medium tracking-normal ${shell.title}`}>
                {s.title}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {transposedKey || effectiveKey ? (
                  <span className="inline-flex h-6 items-center rounded-full bg-[#F3EEF0] px-2.5 text-[11px] font-semibold text-[#7B2D3F]">
                    {transposedKey ?? effectiveKey}
                  </span>
                ) : null}
                {(s.tags[0] ?? '').trim() ? (
                  <span className="inline-flex h-6 items-center rounded-full border border-stone-300 px-2.5 text-[11px] font-medium text-stone-600">
                    {s.tags[0]}
                  </span>
                ) : null}
              </div>
            </div>
            <div className={`pt-0.5 text-right text-[11px] ${shell.meta}`}>{autoScroll ? 'Автопрокрутка' : 'Ручной режим'}</div>
          </div>
        </div>
        <div className="mx-auto mt-2 flex max-w-3xl flex-wrap items-center gap-1.5 px-3 pb-2 md:px-0">
          <div className="inline-flex min-h-[28px] items-center rounded-md border border-stone-300 bg-white px-1 text-[11px] text-stone-700">
            <button
              type="button"
              onClick={() => setTranspose((v) => Math.max(-11, v - 1))}
              className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-stone-100"
              aria-label="Уменьшить тональность"
            >
              <LuMinus className="h-3.5 w-3.5" />
            </button>
            <span className="px-1">Тональность</span>
            <button
              type="button"
              onClick={() => setTranspose((v) => Math.min(11, v + 1))}
              className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-stone-100"
              aria-label="Повысить тональность"
            >
              <LuPlus className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            className="inline-flex min-h-[28px] items-center rounded-md border border-stone-300 bg-white px-2.5 text-[11px] font-medium text-stone-700"
          >
            Темп {s.tempo ?? '—'}
          </button>
          <button
            type="button"
            onClick={toggleStageMode}
            className="inline-flex min-h-[28px] items-center rounded-md border border-stone-300 bg-white px-2.5 text-[11px] font-medium text-stone-700"
          >
            Режим сцены
          </button>
        </div>
      </div>

      <div className="fixed right-4 z-[60]" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}>
        <SongReaderSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          showTrigger={false}
          currentKeyLabel={keyLabel}
          fontSize={fontSize}
          onFontSize={setFontSize}
          transpose={transpose}
          onTranspose={setTranspose}
          onResetTranspose={() => setTranspose(0)}
          showChords={showChords}
          onShowChords={setShowChords}
          autoScroll={autoScroll}
          onAutoScroll={(next) => (next ? startAutoScroll() : stopAutoScroll())}
          onAutoScrollStart={startAutoScroll}
          onAutoScrollStop={stopAutoScroll}
          scrollSpeedLevel={scrollSpeedLevel}
          onScrollSpeedLevel={setScrollSpeedLevel}
          capo={capo}
          onCapo={setCapo}
          showConcertChords={showConcertChords}
          onShowConcertChords={setShowConcertChords}
          chordLayoutMode={chordLayoutMode}
          onChordLayoutMode={setChordLayoutMode}
          fullscreen={fullscreen}
          onFullscreen={setFullscreen}
          stageMode={stageMode}
        />
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-stone-200 bg-white/90 text-stone-800 shadow-lg backdrop-blur hover:bg-white"
          aria-label="Настройки песни"
        >
          <LuSettings2 className="h-5 w-5" />
        </button>
      </div>

      <div style={{ height: fullscreen ? 12 : topOffset }} />
      <div className="space-y-2">
        <LyricsWithChords
          text={effectiveContent}
          transposeSemitones={currentShift}
          chordLayoutMode={chordLayoutMode}
          chordsVisible={stageMode ? false : showChords}
          fontSizePx={stageMode ? 22 : Math.max(16, fontSize)}
          chordTone="light"
          className={[
            'songbook-reader rounded-xl p-4 font-sans text-base',
            stageMode ? 'songbook-reader--stage' : '',
            shell.card,
            'text-stone-900',
            fullscreen ? 'min-h-[calc(100dvh-4rem)]' : '',
          ].join(' ')}
        />
      </div>
    </div>
  );
}
