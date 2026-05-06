import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft, LuMinus, LuPlus, LuSettings2, LuX } from 'react-icons/lu';

import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { keys } from '@/lib/queryKeys';
import { useAuthStore } from '../../auth/authStore';
import { canAccessStudio } from '../../auth/studioAccess';
import { useWakeLock } from '../../../hooks/useWakeLock';
import { fetchSong, recordSongOpened } from '../api';
import { transposeChordSymbol } from '../chordUtils';
import { LyricsWithChords } from '../components/LyricsWithChords';
import { useSongbookChrome } from '../SongbookChromeContext';
import { fetchVersionForSong } from '../../studio/api';
import { useMe } from '@/hooks/useMe';

export function SongDetailPage() {
  const { id } = useParams<{ id: string }>();
  const songId = Number(id);
  const role = useAuthStore((s) => s.role);
  const token = useAuthStore((s) => s.token);
  const meQ = useMe(Boolean(token));
  const studioOk = canAccessStudio(role, meQ.data?.ministry_direction);
  const { stageMode } = useSongbookChrome();
  const [transpose, setTranspose] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  const numberLabel = s.song_number != null ? String(s.song_number) : '';

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-[var(--surface)]/92 backdrop-blur">
        <div className="px-3 py-2 md:px-0">
          <div className="flex min-h-[44px] items-center gap-2">
            <Link
              to="/songbook"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-stone-700 hover:bg-stone-100"
              aria-label="Назад"
            >
              <LuArrowLeft className="h-5 w-5" />
            </Link>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {numberLabel ? (
                  <span className="shrink-0 text-xs font-semibold text-stone-500">#{numberLabel}</span>
                ) : null}
                <h1 className="min-w-0 truncate text-sm font-semibold text-stone-900">{s.title}</h1>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {keyBadge ? (
                  <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                    {keyBadge}
                  </span>
                ) : null}
                {s.tempo != null ? (
                  <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                    {s.tempo} BPM
                  </span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50"
              aria-label="Настройки"
            >
              <LuSettings2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {settingsOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[120] bg-black/35 backdrop-blur-[1px]"
            aria-label="Закрыть настройки"
            onClick={() => setSettingsOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-[121] max-h-[62dvh] overflow-y-auto rounded-t-3xl border border-stone-200 bg-white p-4 shadow-2xl"
            role="dialog"
            aria-label="Настройки текста песни"
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-stone-200" aria-hidden />
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Настройки</p>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100"
                onClick={() => setSettingsOpen(false)}
                aria-label="Закрыть"
              >
                <LuX className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Аккорды</p>
                <label className="flex min-h-[44px] items-center justify-between rounded-xl bg-white px-3 py-2">
                  <span className="text-sm font-medium text-stone-800">Показать аккорды</span>
                  <input
                    type="checkbox"
                    className="h-6 w-11 accent-primary"
                    checked={showChords}
                    onChange={(e) => setShowChords(e.target.checked)}
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Тональность</p>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-white p-2">
                  <button
                    type="button"
                    onClick={() => setTranspose((v) => Math.max(-11, v - 1))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50"
                    aria-label="Ниже"
                  >
                    <LuMinus className="h-5 w-5" />
                  </button>
                  <span className="min-w-[4rem] text-center text-base font-semibold tabular-nums text-stone-900">
                    {transpose > 0 ? `+${transpose}` : transpose}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTranspose((v) => Math.min(11, v + 1))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50"
                    aria-label="Выше"
                  >
                    <LuPlus className="h-5 w-5" />
                  </button>
                </div>
                {keyBadge ? <p className="mt-2 text-[11px] text-stone-500">{keyBadge}</p> : null}
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Размер текста</p>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-white p-2">
                  <button
                    type="button"
                    onClick={() => setFontSize((v) => Math.max(16, v - 1))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50"
                    aria-label="Меньше"
                  >
                    <LuMinus className="h-5 w-5" />
                  </button>
                  <span className="min-w-[4rem] text-center text-base font-semibold tabular-nums text-stone-900">
                    {fontSize}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFontSize((v) => Math.min(28, v + 1))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50"
                    aria-label="Больше"
                  >
                    <LuPlus className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setTranspose(0);
                  setFontSize(18);
                  setShowChords(true);
                }}
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-stone-200 bg-white text-sm font-semibold text-stone-800 hover:bg-stone-50"
              >
                Сбросить настройки
              </button>

              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-stone-900 text-sm font-semibold text-white hover:bg-stone-800"
              >
                Готово
              </button>
            </div>
          </div>
        </>
      ) : null}

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
