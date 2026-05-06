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

/** Компактный переключатель вместо нативного checkbox (единообразно на iOS/Android). */
function SheetSwitch({
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={[
        'relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/35 disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-[var(--primary)]' : 'bg-stone-300 dark:bg-stone-600',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-0.5 left-0.5 h-[26px] w-[26px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-out',
          checked ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

export function SongDetailPage() {
  const { id } = useParams<{ id: string }>();
  const songId = Number(id);
  const role = useAuthStore((s) => s.role);
  const token = useAuthStore((s) => s.token);
  const meQ = useMe(Boolean(token));
  const studioOk = canAccessStudio(role, meQ.data?.ministry_direction);
  const { stageMode, setStageMode } = useSongbookChrome();
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
            className="fixed inset-x-0 bottom-0 z-[121] flex max-h-[min(85dvh,640px)] flex-col overflow-hidden rounded-t-[1.25rem] border border-stone-200 bg-stone-50 shadow-2xl sm:left-1/2 sm:max-w-md sm:-translate-x-1/2"
            role="dialog"
            aria-label="Настройки текста песни"
          >
            <div className="flex shrink-0 flex-col items-center border-b border-stone-200/80 bg-white px-4 pb-3 pt-2">
              <div className="mb-2 h-1 w-10 rounded-full bg-stone-300" aria-hidden />
              <div className="flex w-full items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-stone-900">Как показать текст</p>
                  <p className="mt-0.5 text-xs text-stone-500">Аккорды, тон, размер и режим для сцены</p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100"
                  onClick={() => setSettingsOpen(false)}
                  aria-label="Закрыть"
                >
                  <LuX className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3">
              <div className="divide-y divide-stone-200/90 overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm">
                <div className="flex items-start gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm font-medium text-stone-900">Аккорды</p>
                    <p className="mt-0.5 text-xs leading-snug text-stone-500">
                      {stageMode ? 'В режиме сцены аккорды всегда скрыты.' : 'Показывать строку с аккордами над текстом.'}
                    </p>
                  </div>
                  <SheetSwitch
                    checked={stageMode ? false : showChords}
                    disabled={stageMode}
                    ariaLabel="Показать аккорды"
                    onCheckedChange={setShowChords}
                  />
                </div>

                <div className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-stone-900">Тональность</p>
                    <span className="text-xs tabular-nums text-stone-500">
                      {transpose > 0 ? `+${transpose}` : transpose} полутонов
                    </span>
                  </div>
                  {keyBadge ? <p className="mt-1 text-xs text-stone-500">{keyBadge}</p> : null}
                  <div className="mt-2.5 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTranspose((v) => Math.max(-11, v - 1))}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100 active:scale-[0.98]"
                      aria-label="На полтона ниже"
                    >
                      <LuMinus className="h-4 w-4" />
                    </button>
                    <span className="min-w-[3.5rem] text-center text-lg font-semibold tabular-nums text-stone-900">
                      {transpose > 0 ? `+${transpose}` : transpose}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTranspose((v) => Math.min(11, v + 1))}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100 active:scale-[0.98]"
                      aria-label="На полтона выше"
                    >
                      <LuPlus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-stone-900">Размер текста</p>
                    <span className="text-xs tabular-nums text-stone-500">{fontSize} px</span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFontSize((v) => Math.max(16, v - 1))}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100 active:scale-[0.98]"
                      aria-label="Уменьшить шрифт"
                    >
                      <LuMinus className="h-4 w-4" />
                    </button>
                    <span className="min-w-[3.5rem] text-center text-lg font-semibold tabular-nums text-stone-900">
                      {fontSize}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFontSize((v) => Math.min(28, v + 1))}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100 active:scale-[0.98]"
                      aria-label="Увеличить шрифт"
                    >
                      <LuPlus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm font-medium text-stone-900">Режим сцены</p>
                    <p className="mt-0.5 text-xs leading-snug text-stone-500">
                      Тёмный фон и крупный текст — удобно держать телефон на стойке.
                    </p>
                  </div>
                  <SheetSwitch
                    checked={stageMode}
                    ariaLabel="Режим сцены"
                    onCheckedChange={setStageMode}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTranspose(0);
                    setFontSize(18);
                    setShowChords(true);
                    setStageMode(false);
                  }}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-stone-200 bg-white text-sm font-semibold text-stone-800 hover:bg-stone-50"
                >
                  Сбросить к умолчанию
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-stone-900 text-sm font-semibold text-white hover:bg-stone-800"
                >
                  Готово
                </button>
              </div>
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
