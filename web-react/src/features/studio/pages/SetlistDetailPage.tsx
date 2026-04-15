import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';

import { emitAppToast } from '../../../lib/uiFeedback';
import { useStudioModuleSurface } from '../studioPaths';
import { LuCopy, LuFileDown } from 'react-icons/lu';

import { exportSetlistPdf } from '../../songbook/pdfExport';
import { fetchSongs } from '../../songbook/api';
import {
  addSetlistItem,
  fetchMyVersions,
  fetchSetlistItems,
  fetchSetlists,
  patchSetlist,
  removeSetlistItem,
} from '../api';

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

  if (!Number.isInteger(setlistId) || setlistId <= 0) {
    return <p className="text-red-400">Некорректный id</p>;
  }

  const songs = songsQ.data ?? [];
  const songbookHome = '/songbook';
  const hasVersionFor = (songId: string) =>
    (versionsQ.data ?? []).some((v) => v.song_id === songId);

  const shareUrl =
    meta?.share_token && typeof window !== 'undefined'
      ? `${window.location.origin}/setlist-share/${meta.share_token}`
      : '';

  return (
    <div
      className={[
        'mx-auto max-w-3xl space-y-6',
        surface === 'songbook' ? 'rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-4 shadow-inner md:p-6' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Позиции сетлиста</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Выберите песню в списке ниже и нажмите «Добавить». Порядок — как в списке (сверху вниз).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            <LuFileDown className="h-4 w-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <p className="mb-2 text-xs font-bold uppercase text-zinc-500">Публичная ссылка</p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={Boolean(meta?.is_public)}
            onChange={(e) => publicMut.mutate(e.target.checked)}
            disabled={publicMut.isPending || !meta}
          />
          Открыть просмотр по ссылке (без входа в приложение)
        </label>
        {meta?.is_public && shareUrl && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded bg-zinc-950 px-2 py-1 text-xs text-sky-300">
              {shareUrl}
            </code>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-2 py-1 text-xs text-white hover:bg-zinc-700"
              onClick={() => void navigator.clipboard.writeText(shareUrl)}
            >
              <LuCopy className="h-3 w-3" />
              Копировать
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <p className="mb-2 text-xs font-bold uppercase text-zinc-500">Добавить песню</p>
        {songsQ.isLoading && (
          <p className="text-sm text-zinc-500">Загрузка каталога песен…</p>
        )}
        {songsQ.isError && (
          <p className="text-sm text-amber-400">
            Не удалось загрузить песни. Обновите страницу или проверьте подключение.
          </p>
        )}
        {!songsQ.isLoading && !songsQ.isError && songs.length === 0 && (
          <p className="text-sm text-zinc-400">
            В песеннике пока нет песен — сначала добавьте их в разделе{' '}
            <Link to={songbookHome} className="text-sky-400 hover:text-sky-300">
              Песенник
            </Link>
            .
          </p>
        )}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white disabled:opacity-50"
            value={pickSong}
            onChange={(e) => setPickSong(e.target.value)}
            disabled={songsQ.isLoading || songsQ.isError || songs.length === 0}
          >
            <option value="">{songsQ.isLoading ? 'Загрузка…' : 'Выберите песню'}</option>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
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
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500 disabled:opacity-50"
          >
            Добавить
          </button>
        </div>
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-zinc-200">
        {itemsQ.isLoading && (
          <li className="text-sm text-zinc-500">Загрузка позиций…</li>
        )}
        {!itemsQ.isLoading && (itemsQ.data ?? []).length === 0 && (
          <li className="rounded border border-dashed border-zinc-700 py-6 pl-0 text-sm text-zinc-500 list-none -ml-1">
            Пока пусто — добавьте песни блоком выше.
          </li>
        )}
        {(itemsQ.data ?? []).map((it, idx) => (
          <li key={it.id} className="rounded border border-zinc-800 bg-zinc-900/60 py-2 pr-3 pl-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs text-zinc-500">{idx + 1}. </span>
                <span className="font-medium">{it.song.title}</span>
                {it.studio_version_id && (
                  <span className="ml-2 text-xs text-amber-400">моя версия</span>
                )}
                <p className="mt-1 font-mono text-xs text-zinc-500 line-clamp-2">
                  {it.effective_content_preview}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Убрать из сетлиста?')) removeMut.mutate(Number(it.id));
                }}
                className="shrink-0 text-xs text-red-400"
              >
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
