import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuArrowLeft, LuSettings2 } from 'react-icons/lu';

import { dispatchLayoutMainChrome } from '../../../app/layoutChrome';
import { useAuthStore } from '../../auth/authStore';
import { canAccessStudioRole, canDeleteSongFromCatalog } from '../../auth/studioAccess';
import { emitAppToast } from '../../../lib/uiFeedback';
import { isMainSongbookDeploy } from '../../../lib/appVariant';
import { studioEditSongPath, useStudioModuleSurface } from '../../studio/studioPaths';
import { useWakeLock } from '../../../hooks/useWakeLock';
import { deleteSong, fetchSong, forkInStudio, recordSongOpened } from '../api';
import { LyricsWithChords } from '../components/LyricsWithChords';
import { SongReaderSettings } from '../components/SongReaderSettings';
import { useSongbookChrome } from '../SongbookChromeContext';

export function SongDetailPage() {
  const semitoneLabel = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const { id } = useParams<{ id: string }>();
  const songId = Number(id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const surface = useStudioModuleSurface();
  const role = useAuthStore((s) => s.role);
  const token = useAuthStore((s) => s.token);
  const studioOk = canAccessStudioRole(role);
  const canDeleteCatalog = canDeleteSongFromCatalog(role);
  const mainOnly = isMainSongbookDeploy();
  const { stageMode } = useSongbookChrome();

  const [transpose, setTranspose] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showChords, setShowChords] = useState(true);
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(40);
  const [fontSize, setFontSize] = useState(18);
  const [capo, setCapo] = useState(0);
  const [showConcertChords, setShowConcertChords] = useState(false);

  const q = useQuery({
    queryKey: ['song', songId],
    queryFn: () => fetchSong(songId),
    enabled: Number.isInteger(songId) && songId > 0,
  });

  useWakeLock(true);

  useEffect(() => {
    if (!token || !Number.isInteger(songId) || songId <= 0) return;
    void recordSongOpened(songId).catch(() => {});
  }, [token, songId]);

  /** Режим «чистого чтения»: при прокрутке вниз скрываем основной хром приложения. */
  useEffect(() => {
    const isMobileViewport = () =>
      typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

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
  }, []);

  useEffect(() => {
    if (!autoScroll) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const bpmFactor = q.data?.tempo ? Math.max(0.65, Math.min(2.4, Number(q.data.tempo) / 80)) : 1;
      window.scrollBy(0, scrollSpeed * bpmFactor * dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoScroll, scrollSpeed, q.data?.tempo]);

  const forkMut = useMutation({
    mutationFn: () => forkInStudio(songId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
      navigate(studioEditSongPath(surface, songId));
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSong(songId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: ['songs', 'catalog'] });
      void qc.invalidateQueries({ queryKey: ['songs', 'catalog-all'] });
      emitAppToast({ kind: 'success', message: 'Песня удалена из каталога' });
      navigate('/songbook', { replace: true });
    },
    onError: () => emitAppToast('Не удалось удалить песню'),
  });

  const metaLine = useMemo(() => {
    if (!q.data) return '';
    const s = q.data;
    return `Тональность: ${s.default_key ?? '—'} · Темп: ${s.tempo ?? '—'} · Размер: ${s.time_signature ?? '—'}`;
  }, [q.data]);

  if (!Number.isInteger(songId) || songId <= 0) {
    return <p className="text-red-600">Некорректная ссылка</p>;
  }
  if (q.isLoading) return <p className="text-stone-500">Загрузка…</p>;
  if (q.isError || !q.data) return <p className="text-red-600">Песня не найдена</p>;

  const s = q.data;
  const currentShift = showChords
    ? showConcertChords
      ? transpose
      : transpose - capo
    : 0;

  const shell = stageMode
    ? {
        page: 'text-stone-900',
        top: 'border-stone-200 bg-[var(--surface)]/95',
        title: 'text-stone-900',
        meta: 'text-stone-500',
        card: 'border border-stone-200 bg-white',
        settingsBtn: 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
      }
    : {
        page: 'text-stone-900',
        top: 'border-stone-200 bg-[var(--surface)]/95',
        title: 'text-stone-900',
        meta: 'text-stone-500',
        card: 'border border-stone-200 bg-white',
        settingsBtn: 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
      };

  return (
    <div className={`relative mx-auto max-w-3xl pb-24 ${shell.page}`}>
      <SongReaderSettings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        showTrigger={false}
        fontSize={fontSize}
        onFontSize={setFontSize}
        transpose={transpose}
        onTranspose={setTranspose}
        showChords={showChords}
        onShowChords={setShowChords}
        autoScroll={autoScroll}
        onAutoScroll={setAutoScroll}
        scrollSpeed={scrollSpeed}
        onScrollSpeed={setScrollSpeed}
        capo={capo}
        onCapo={setCapo}
        showConcertChords={showConcertChords}
        onShowConcertChords={setShowConcertChords}
        stageMode={stageMode}
      />

      <div
        className={[
          'sticky top-0 z-30 -mx-3 border-b px-3 py-2 backdrop-blur md:-mx-0 md:px-0',
          shell.top,
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/songbook"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100"
              aria-label="Назад к списку"
            >
              <LuArrowLeft className="h-5 w-5" />
            </Link>
            <span className="w-6 shrink-0 text-center text-xl font-medium text-stone-500">{songId}</span>
            <h1 className={`truncate text-xl font-bold uppercase tracking-wide md:text-2xl ${shell.title}`}>
              {s.title}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${shell.settingsBtn}`}
            aria-label="Настройки просмотра"
          >
            <LuSettings2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <p className={`text-xs ${shell.meta}`}>
          {metaLine}
          {capo > 0 ? ` · Капо: ${capo}` : ''}
        </p>
        <LyricsWithChords
          text={s.content}
          transposeSemitones={currentShift}
          chordsVisible={showChords}
          fontSizePx={fontSize}
          chordTone="light"
          className={[
            'rounded-xl p-4 font-sans text-base',
            shell.card,
            'text-stone-900',
          ].join(' ')}
        />
        {showChords && capo > 0 ? (
          <p className={`text-xs ${shell.meta}`}>
            {showConcertChords
              ? `Концертные аккорды (${semitoneLabel(transpose)})`
              : `Аккорды для игры с капо (${semitoneLabel(transpose - capo)})`}
          </p>
        ) : null}

        {!mainOnly && studioOk ? (
          <button
            type="button"
            onClick={() => forkMut.mutate()}
            disabled={forkMut.isPending}
            className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Открыть в студии
          </button>
        ) : null}
        {canDeleteCatalog ? (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `Удалить «${s.title}» из каталога? Связанные версии в студии и позиции в сетлистах будут удалены. Действие необратимо.`,
                )
              ) {
                deleteMut.mutate();
              }
            }}
            disabled={deleteMut.isPending}
            className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-red-700 px-3 text-sm text-red-300 hover:bg-red-900/30 disabled:opacity-50"
          >
            Удалить из каталога
          </button>
        ) : null}
      </div>
    </div>
  );
}
