import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft } from 'react-icons/lu';

import { dispatchLayoutMainChrome } from '../../../app/layoutChrome';
import { useAuthStore } from '../../auth/authStore';
import { useWakeLock } from '../../../hooks/useWakeLock';
import { fetchSong, recordSongOpened } from '../api';
import { LyricsWithChords } from '../components/LyricsWithChords';
import { useSongbookChrome } from '../SongbookChromeContext';

export function SongDetailPage() {
  const { id } = useParams<{ id: string }>();
  const songId = Number(id);
  const token = useAuthStore((s) => s.token);
  const { stageMode } = useSongbookChrome();

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
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <p className={`text-xs ${shell.meta}`}>{metaLine}</p>
        <LyricsWithChords
          text={s.content}
          transposeSemitones={0}
          chordsVisible
          fontSizePx={15}
          chordTone="light"
          className={[
            'rounded-xl p-4 font-sans text-base',
            shell.card,
            'text-stone-900',
          ].join(' ')}
        />
      </div>
    </div>
  );
}
