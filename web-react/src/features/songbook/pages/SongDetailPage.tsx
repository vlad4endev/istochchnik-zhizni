import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft, LuMinus, LuPlus } from 'react-icons/lu';

import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { keys } from '@/lib/queryKeys';
import { useAuthStore } from '../../auth/authStore';
import { canAccessStudioRole } from '../../auth/studioAccess';
import { useWakeLock } from '../../../hooks/useWakeLock';
import { fetchSong, recordSongOpened } from '../api';
import { transposeChordSymbol } from '../chordUtils';
import { LyricsWithChords } from '../components/LyricsWithChords';
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
  const [fontSize, setFontSize] = useState(18);

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

  if (!Number.isInteger(songId) || songId <= 0) {
    return <p className="text-red-600">Некорректная ссылка</p>;
  }
  if (q.isLoading) return <SongListSkeleton />;
  if (q.isError || !q.data) return <p className="text-red-600">Песня не найдена</p>;

  const s = q.data;
  const version = (versionQ.data as { custom_content?: string | null; custom_key?: string | null } | null) ?? null;
  const effectiveContent = version?.custom_content ?? s.content;
  const effectiveKey = version?.custom_key ?? s.default_key;
  const currentShift = showChords ? transpose : 0;
  const transposedKey = effectiveKey ? transposeChordSymbol(effectiveKey, currentShift) : null;

  const keyBadge = (() => {
    if (!effectiveKey && currentShift === 0) return null;
    if (!effectiveKey) return `Сдвиг ${currentShift > 0 ? '+' : ''}${currentShift}`;
    const next = transposedKey ?? effectiveKey;
    return currentShift === 0 ? next : `${effectiveKey} → ${next}`;
  })();

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-[var(--surface)]/90 backdrop-blur">
        <div className="px-3 py-2 md:px-0">
          <div className="flex items-center justify-between gap-2">
            <Link
              to="/songbook"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl px-2 text-sm font-semibold text-stone-700 hover:bg-stone-100"
              aria-label="Назад к списку"
            >
              <LuArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Назад</span>
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleStageMode}
                className="inline-flex min-h-[40px] items-center rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-800 hover:bg-stone-50"
              >
                Режим сцены
              </button>
            </div>
          </div>

          <div className="mt-2 min-w-0">
            <h1 className="truncate text-[17px] font-semibold leading-snug text-stone-900 sm:text-lg">
              {s.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {keyBadge ? (
                <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700">
                  {keyBadge}
                </span>
              ) : null}
              {s.tempo != null ? (
                <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700">
                  {s.tempo} BPM
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="inline-flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setTranspose((v) => Math.max(-11, v - 1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100"
                aria-label="Уменьшить тональность"
              >
                <LuMinus className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs font-semibold text-stone-700">Тональность</span>
              <button
                type="button"
                onClick={() => setTranspose((v) => Math.min(11, v + 1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100"
                aria-label="Повысить тональность"
              >
                <LuPlus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowChords((v) => !v)}
              className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-800 hover:bg-stone-50"
            >
              {showChords ? 'Аккорды: вкл' : 'Аккорды: выкл'}
            </button>

            <div className="inline-flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setFontSize((v) => Math.max(16, v - 1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100"
                aria-label="Уменьшить шрифт"
              >
                <LuMinus className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs font-semibold text-stone-700">Шрифт</span>
              <button
                type="button"
                onClick={() => setFontSize((v) => Math.min(26, v + 1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100"
                aria-label="Увеличить шрифт"
              >
                <LuPlus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setTranspose(0);
                setFontSize(18);
                setShowChords(true);
              }}
              className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs font-semibold text-stone-800 hover:bg-stone-100"
            >
              Сброс
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [webkit-overflow-scrolling:touch] md:px-0">
        <LyricsWithChords
          text={effectiveContent}
          transposeSemitones={currentShift}
          chordsVisible={stageMode ? false : showChords}
          fontSizePx={stageMode ? 22 : fontSize}
          chordTone="light"
          className={[
            'songbook-reader rounded-2xl border border-stone-200 bg-white p-5',
            'font-sans leading-relaxed text-stone-900',
            stageMode ? 'songbook-reader--stage' : '',
          ].join(' ')}
        />
        <div className="h-[calc(var(--app-bottom-nav-total-height)+12px)]" />
      </main>
    </div>
  );
}
