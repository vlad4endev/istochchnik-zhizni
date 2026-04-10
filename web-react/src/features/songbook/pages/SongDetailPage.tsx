import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuFileDown, LuHeart, LuSettings2, LuSparkles } from 'react-icons/lu';

import { dispatchLayoutMainChrome } from '../../../app/layoutChrome';
import { useAuthStore } from '../../auth/authStore';
import { canAccessStudioRole } from '../../auth/studioAccess';
import { studioEditSongPath, useStudioModuleSurface } from '../../studio/studioPaths';
import { useWakeLock } from '../../../hooks/useWakeLock';
import { deleteFavorite, fetchSong, forkInStudio, postFavorite, recordSongOpened } from '../api';
import { LyricsWithChords } from '../components/LyricsWithChords';
import { SongReaderSettings } from '../components/SongReaderSettings';
import { exportSongPdf } from '../pdfExport';
import { useSongbookChrome } from '../SongbookChromeContext';

export function SongDetailPage() {
  const { id } = useParams<{ id: string }>();
  const songId = Number(id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const surface = useStudioModuleSurface();
  const role = useAuthStore((s) => s.role);
  const token = useAuthStore((s) => s.token);
  const studioOk = canAccessStudioRole(role);
  const { stageMode } = useSongbookChrome();

  const [transpose, setTranspose] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showChords, setShowChords] = useState(true);
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(40);

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
      window.scrollBy(0, scrollSpeed * dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoScroll, scrollSpeed]);

  const favMut = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) await postFavorite(songId);
      else await deleteFavorite(songId);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['song', songId] }),
  });

  const forkMut = useMutation({
    mutationFn: () => forkInStudio(songId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
      navigate(studioEditSongPath(surface, songId));
    },
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

  const shell = stageMode
    ? {
        link: 'text-zinc-400 hover:text-zinc-200',
        title: 'text-zinc-50',
        meta: 'text-zinc-400',
        border: 'border-zinc-800',
        card: 'border-zinc-800 bg-zinc-950/80',
        tag: 'bg-zinc-800 text-zinc-200',
        btn: 'border-zinc-600 bg-zinc-900 text-zinc-100 hover:bg-zinc-800',
        primary: 'bg-zinc-100 text-zinc-900 hover:bg-white',
      }
    : {
        link: 'text-stone-500 hover:text-stone-800',
        title: 'text-stone-900',
        meta: 'text-stone-600',
        border: 'border-stone-200',
        card: 'border-stone-200 bg-white',
        tag: 'bg-stone-100 text-stone-700',
        btn: 'border-stone-200 bg-white text-stone-800 hover:bg-stone-50',
        primary: 'bg-stone-900 text-white hover:bg-stone-800',
      };

  return (
    <div className="relative mx-auto max-w-3xl pb-32">
      <SongReaderSettings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        transpose={transpose}
        onTranspose={setTranspose}
        showChords={showChords}
        onShowChords={setShowChords}
        autoScroll={autoScroll}
        onAutoScroll={setAutoScroll}
        scrollSpeed={scrollSpeed}
        onScrollSpeed={setScrollSpeed}
        stageMode={stageMode}
      />

      <Link to="/songbook" className={`mb-3 inline-flex min-h-[44px] items-center text-sm ${shell.link}`}>
        ← К списку
      </Link>

      <div
        className={[
          'sticky top-0 z-30 -mx-3 border-b px-3 py-3 shadow-sm backdrop-blur md:-mx-0 md:px-0',
          stageMode ? 'border-zinc-800 bg-[#030303]/90' : 'border-stone-200 bg-[var(--surface)]/95',
        ].join(' ')}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className={`truncate text-xl font-bold md:text-2xl ${shell.title}`}>{s.title}</h1>
              {s.has_studio_version && (
                <span title="Есть индивидуальная версия в студии">
                  <LuSparkles className="h-5 w-5 shrink-0 text-amber-500" />
                </span>
              )}
            </div>
            <p className={`mt-0.5 text-xs md:text-sm ${shell.meta}`}>{metaLine}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportSongPdf({
                  title: s.title,
                  metaLine,
                  body: s.content,
                  transposeSemitones: transpose,
                  fileName: `${s.slug || 'pesnya'}.pdf`,
                })
              }
              className={`inline-flex min-h-[44px] items-center gap-1 rounded-xl border px-3 text-sm font-medium ${shell.btn}`}
            >
              <LuFileDown className="h-4 w-4" />
              PDF
            </button>
            <button
              type="button"
              onClick={() => favMut.mutate(!s.is_favorite)}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-sm font-medium ${shell.btn}`}
            >
              <LuHeart className={`h-4 w-4 ${s.is_favorite ? 'fill-red-500 text-red-500' : ''}`} />
              {s.is_favorite ? 'В избранном' : 'Избранное'}
            </button>
            {studioOk && (
              <button
                type="button"
                onClick={() => forkMut.mutate()}
                disabled={forkMut.isPending}
                className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold ${shell.primary}`}
              >
                В студии
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {s.tags?.length ? (
          <p className={`text-xs ${shell.meta}`}>
            Теги:{' '}
            {s.tags.map((t) => (
              <span key={t} className={`mr-2 rounded-full px-2 py-0.5 ${shell.tag}`}>
                {t}
              </span>
            ))}
          </p>
        ) : null}
        <LyricsWithChords
          text={s.content}
          transposeSemitones={showChords ? transpose : 0}
          chordsVisible={showChords}
          chordTone={stageMode ? 'dark' : 'light'}
          className={[
            'rounded-2xl border p-4 font-sans text-base',
            shell.card,
            stageMode ? 'text-zinc-100' : 'text-stone-900',
          ].join(' ')}
        />
      </div>

      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className={[
          'fixed right-4 z-40 inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full shadow-lg transition-all',
          stageMode ? 'bottom-24 bg-zinc-800 text-zinc-100 hover:bg-zinc-700' : 'bottom-28 bg-stone-900 text-white hover:bg-stone-800',
          'md:bottom-auto md:right-6 md:top-24',
        ].join(' ')}
        style={{
          marginBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        aria-label="Настройки просмотра"
      >
        <LuSettings2 className="h-6 w-6" />
      </button>
    </div>
  );
}
