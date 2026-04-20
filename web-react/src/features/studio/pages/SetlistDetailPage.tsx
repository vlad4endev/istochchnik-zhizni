import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';

import { emitAppToast } from '../../../lib/uiFeedback';
import { studioSetlistPerformPath, studioSetlistsIndexPath, useStudioModuleSurface } from '../studioPaths';
import { LuArrowDown, LuArrowUp, LuCopy, LuFileDown, LuChevronLeft, LuMic, LuSearch } from 'react-icons/lu';

import { exportSetlistPdf } from '../../songbook/pdfExport';
import { fetchSongs } from '../../songbook/api';
import {
  addSetlistItem,
  fetchMyVersions,
  fetchSetlistItems,
  fetchSetlists,
  patchSetlist,
  removeSetlistItem,
  reorderSetlistItems,
} from '../api';
import { SetlistMusicianNotesEditor } from '../components/SetlistMusicianNotesEditor';

export function SetlistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const setlistId = Number(id);
  const qc = useQueryClient();
  const surface = useStudioModuleSurface();

  const itemsQ = useQuery({
    queryKey: ['studio', 'setlist', setlistId, 'items'],
    queryFn: () => fetchSetlistItems(setlistId),
    enabled: Number.isInteger(setlistId) && setlistId > 0,
  });

  const setlistsQ = useQuery({ queryKey: ['studio', 'setlists'], queryFn: fetchSetlists });
  const songsQ = useQuery({
    queryKey: ['songs', 'catalog-all'],
    queryFn: () => fetchSongs(),
  });
  const versionsQ = useQuery({ queryKey: ['studio', 'versions'], queryFn: fetchMyVersions });

  const meta = useMemo(
    () => setlistsQ.data?.find((s) => s.id === String(setlistId)),
    [setlistsQ.data, setlistId],
  );

  const [pickSong, setPickSong] = useState('');
  const [useMyVersion, setUseMyVersion] = useState(false);
  const [songSearch, setSongSearch] = useState('');

  const publicMut = useMutation({
    mutationFn: (is_public: boolean) => patchSetlist(setlistId, { is_public }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['studio', 'setlists'] }),
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const songId = Number(pickSong);
      if (!Number.isInteger(songId) || songId <= 0) {
        throw new Error('Выберите песню из списка');
      }
      let studioVersionId: number | null = null;
      if (useMyVersion) {
        const v = (versionsQ.data ?? []).find((x) => x.song_id === pickSong);
        if (v) studioVersionId = Number(v.id);
      }
      await addSetlistItem(setlistId, songId, studioVersionId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studio', 'setlist', setlistId, 'items'] });
      emitAppToast({ kind: 'success', message: 'Песня добавлена в сетлист' });
      setPickSong('');
      setUseMyVersion(false);
    },
    onError: (err: unknown) => {
      let msg = 'Не удалось добавить песню';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { error?: string } | undefined;
        if (d?.error && typeof d.error === 'string') msg = d.error;
      } else if (err instanceof Error && err.message) {
        msg = err.message;
      }
      emitAppToast(msg);
    },
  });

  const removeMut = useMutation({
    mutationFn: (itemId: number) => removeSetlistItem(setlistId, itemId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['studio', 'setlist', setlistId, 'items'] }),
  });

  const reorderMut = useMutation({
    mutationFn: (orderedIds: number[]) => reorderSetlistItems(setlistId, orderedIds),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['studio', 'setlist', setlistId, 'items'] }),
    onError: () => emitAppToast('Не удалось изменить порядок'),
  });

  const moveItem = (index: number, dir: -1 | 1) => {
    const arr = [...(itemsQ.data ?? [])];
    const j = index + dir;
    if (j < 0 || j >= arr.length) return;
    const t = arr[index];
    arr[index] = arr[j];
    arr[j] = t;
    reorderMut.mutate(arr.map((x) => Number(x.id)));
  };

  if (!Number.isInteger(setlistId) || setlistId <= 0) {
    return <p className="text-red-600">Некорректный id</p>;
  }

  const songs = songsQ.data ?? [];
  const filteredSongs = useMemo(() => {
    const q = songSearch.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((s) => s.title.toLowerCase().includes(q));
  }, [songs, songSearch]);
  const songbookHome = '/songbook';
  const hasVersionFor = (songId: string) =>
    (versionsQ.data ?? []).some((v) => v.song_id === songId);

  const shareUrl =
    meta?.share_token && typeof window !== 'undefined'
      ? `${window.location.origin}/setlist-share/${meta.share_token}`
      : '';

  const pageCard =
    surface === 'songbook'
      ? 'rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-6'
      : '';

  return (
    <div className={['mx-auto max-w-3xl space-y-8', pageCard].filter(Boolean).join(' ')}>
      <Link
        to={studioSetlistsIndexPath(surface)}
        className="inline-flex items-center gap-1 text-sm font-medium text-stone-600 hover:text-sky-700"
      >
        <LuChevronLeft className="h-4 w-4" aria-hidden />
        Все сетлисты
      </Link>

      <div className="space-y-4 border-b border-stone-200 pb-5">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-stone-900">{meta?.title ?? 'Сетлист'}</h1>
          <p className="mt-1 text-sm text-stone-600">
            Сначала соберите программу, затем используйте режим выступления или экспорт PDF.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={studioSetlistPerformPath(surface, setlistId)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
          >
            <LuMic className="h-4 w-4 shrink-0" aria-hidden />
            Режим выступления
          </Link>
          <button
            type="button"
            onClick={() => {
              const items = itemsQ.data ?? [];
              if (!meta || items.length === 0) return;
              exportSetlistPdf({
                setlistTitle: meta.title,
                songs: items.map((it) => ({
                  title: it.song.title,
                  body: it.effective_content || it.song.content,
                  transpose: 0,
                })),
                fileName: `setlist-${setlistId}.pdf`,
              });
            }}
            disabled={!itemsQ.data?.length}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-40"
          >
            <LuFileDown className="h-4 w-4 shrink-0" aria-hidden />
            Скачать PDF
          </button>
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="setlist-build-heading">
        <h2 id="setlist-build-heading" className="text-sm font-semibold text-stone-900">
          Сборка программы
        </h2>

        <details className="rounded-xl border border-stone-200 bg-stone-50/80" open={Boolean(meta?.is_public)}>
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-stone-800 marker:hidden [&::-webkit-details-marker]:hidden">
            Публичная ссылка для группы
          </summary>
          <div className="border-t border-stone-200 px-4 pb-4 pt-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                className="rounded border-stone-300 text-sky-600 focus:ring-sky-500"
                checked={Boolean(meta?.is_public)}
                onChange={(e) => publicMut.mutate(e.target.checked)}
                disabled={publicMut.isPending || !meta}
              />
              Открыть просмотр по ссылке (без входа в приложение)
            </label>
            {meta?.is_public && shareUrl && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="max-w-full truncate rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-sky-800">
                  {shareUrl}
                </code>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50"
                  onClick={() => void navigator.clipboard.writeText(shareUrl)}
                >
                  <LuCopy className="h-3 w-3" />
                  Копировать
                </button>
              </div>
            )}
          </div>
        </details>

        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Добавить песню</p>
          <div className="relative mb-3">
            <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              value={songSearch}
              onChange={(e) => setSongSearch(e.target.value)}
              placeholder="Поиск по названию…"
              className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2.5 pl-10 pr-3 text-sm text-stone-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </div>
          {songsQ.isLoading && <p className="text-sm text-stone-500">Загрузка каталога песен…</p>}
          {songsQ.isError && (
            <p className="text-sm text-amber-700">
              Не удалось загрузить песни. Обновите страницу или проверьте подключение.
            </p>
          )}
          {!songsQ.isLoading && !songsQ.isError && songs.length === 0 && (
            <p className="text-sm text-stone-600">
              В песеннике пока нет песен — сначала добавьте их в разделе{' '}
              <Link to={songbookHome} className="font-semibold text-sky-700 hover:text-sky-800">
                Песенник
              </Link>
              .
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className="min-h-[44px] flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-50"
              value={pickSong}
              onChange={(e) => setPickSong(e.target.value)}
              disabled={songsQ.isLoading || songsQ.isError || songs.length === 0}
            >
              <option value="">{songsQ.isLoading ? 'Загрузка…' : 'Выберите песню'}</option>
              {filteredSongs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-stone-600">
              <input
                type="checkbox"
                className="rounded border-stone-300 text-sky-600 focus:ring-sky-500"
                checked={useMyVersion}
                onChange={(e) => setUseMyVersion(e.target.checked)}
                disabled={!pickSong || !hasVersionFor(pickSong)}
              />
              Моя версия
            </label>
            <button
              type="button"
              onClick={() => addMut.mutate()}
              disabled={!pickSong || addMut.isPending || songsQ.isLoading || songs.length === 0}
              className="min-h-[44px] rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              Добавить
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="setlist-order-heading">
        <h2 id="setlist-order-heading" className="text-sm font-semibold text-stone-900">
          Порядок в программе
        </h2>
        <p className="text-xs text-stone-500">
          Стрелки меняют порядок. Заметки для группы — только в режиме выступления (вошедшие пользователи), не в
          публичной ссылке.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-stone-800">
          {itemsQ.isLoading && <li className="text-sm text-stone-500">Загрузка позиций…</li>}
          {!itemsQ.isLoading && (itemsQ.data ?? []).length === 0 && (
            <li className="-ml-1 list-none rounded-xl border border-dashed border-stone-300 py-8 pl-4 text-sm text-stone-600">
              Пока пусто — выберите песню выше и нажмите «Добавить».
            </li>
          )}
          {(itemsQ.data ?? []).map((it, idx) => {
            const n = it.musician_notes;
            const hasNotes =
              (n?.lineComments && Object.keys(n.lineComments).length > 0) ||
              (n?.blockComments && n.blockComments.length > 0);
            return (
              <li
                key={it.id}
                className="rounded-xl border border-stone-200 bg-white py-3 pr-3 pl-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-stone-500">{idx + 1}.</span>
                      <span className="font-semibold text-stone-900">{it.song.title}</span>
                      {it.studio_version_id ? (
                        <span className="text-xs font-medium text-amber-700">моя версия</span>
                      ) : null}
                      {hasNotes ? (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-800">
                          заметки
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 font-mono text-xs text-stone-500 line-clamp-2">
                      {it.effective_content_preview}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        disabled={idx <= 0 || reorderMut.isPending}
                        onClick={() => moveItem(idx, -1)}
                        className="rounded-lg border border-stone-200 p-2 text-stone-600 hover:bg-stone-50 disabled:opacity-30"
                        aria-label="Выше"
                      >
                        <LuArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx >= (itemsQ.data ?? []).length - 1 || reorderMut.isPending}
                        onClick={() => moveItem(idx, 1)}
                        className="rounded-lg border border-stone-200 p-2 text-stone-600 hover:bg-stone-50 disabled:opacity-30"
                        aria-label="Ниже"
                      >
                        <LuArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Убрать из сетлиста?')) removeMut.mutate(Number(it.id));
                      }}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
                <details className="mt-3 rounded-lg border border-violet-100 bg-violet-50/30">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-violet-900 marker:hidden [&::-webkit-details-marker]:hidden">
                    Заметки для музыкантов (режим выступления)
                  </summary>
                  <div className="border-t border-violet-100 px-3 pb-3">
                    <SetlistMusicianNotesEditor setlistId={setlistId} item={it} />
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
