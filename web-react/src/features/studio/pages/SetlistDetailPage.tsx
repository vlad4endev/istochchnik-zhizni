import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
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
      if (!Number.isInteger(songId) || songId <= 0) return;
      let studioVersionId: number | null = null;
      if (useMyVersion) {
        const v = (versionsQ.data ?? []).find((x) => x.song_id === String(songId));
        if (v) studioVersionId = Number(v.id);
      }
      await addSetlistItem(setlistId, songId, studioVersionId);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['studio', 'setlist', setlistId, 'items'] }),
  });

  const removeMut = useMutation({
    mutationFn: (itemId: number) => removeSetlistItem(setlistId, itemId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['studio', 'setlist', setlistId, 'items'] }),
  });

  if (!Number.isInteger(setlistId) || setlistId <= 0) {
    return <p className="text-red-400">Некорректный id</p>;
  }

  if (itemsQ.isLoading) return <p className="text-zinc-500">Загрузка…</p>;

  const songs = songsQ.data ?? [];
  const hasVersionFor = (songId: string) =>
    (versionsQ.data ?? []).some((v) => v.song_id === songId);

  const shareUrl =
    meta?.share_token && typeof window !== 'undefined'
      ? `${window.location.origin}/setlist-share/${meta.share_token}`
      : '';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-lg font-semibold text-white">Позиции сетлиста</h1>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            value={pickSong}
            onChange={(e) => setPickSong(e.target.value)}
          >
            <option value="">Выберите песню</option>
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
            disabled={!pickSong || addMut.isPending}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500 disabled:opacity-50"
          >
            Добавить
          </button>
        </div>
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-zinc-200">
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
