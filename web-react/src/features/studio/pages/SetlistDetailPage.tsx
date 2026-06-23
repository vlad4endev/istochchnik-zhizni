import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMemo, useState, useCallback } from 'react';

import { emitAppToast } from '../../../lib/uiFeedback';
import { studioSetlistPerformPath, studioSetlistsIndexPath, useStudioModuleSurface } from '../studioPaths';
import { LuArrowDown, LuArrowUp, LuCopy, LuFileDown, LuChevronLeft, LuLink, LuMic, LuMusic2, LuPlay, LuSearch, LuShare2, LuSparkles } from 'react-icons/lu';
import { SkeletonBox } from '@/components/ui/SkeletonBox';

import { exportSetlistPdf } from '../../songbook/pdfExport';
import { fetchSongs } from '../../songbook/api';
import { keys } from '@/lib/queryKeys';
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
import { SetlistSongSheetPreview } from '../components/SetlistSongSheetPreview';

export function SetlistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const setlistId = Number(id);
  const qc = useQueryClient();
  const surface = useStudioModuleSurface();
  const welcomeFromPlanner = searchParams.get('welcome') === 'planner';

  const itemsQ = useQuery({
    queryKey: ['studio', 'setlist', setlistId, 'items'],
    queryFn: () => fetchSetlistItems(setlistId),
    enabled: Number.isInteger(setlistId) && setlistId > 0,
  });

  const setlistsQ = useQuery({ queryKey: ['studio', 'setlists'], queryFn: fetchSetlists });
  const songsQ = useQuery({
    queryKey: keys.songs,
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

  const songs = songsQ.data ?? [];
  const filteredSongs = useMemo(() => {
    const q = songSearch.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((s) => s.title.toLowerCase().includes(q));
  }, [songs, songSearch]);

  const shareUrl =
    meta?.share_token && typeof window !== 'undefined'
      ? `${window.location.origin}/setlist-share/${meta.share_token}`
      : '';

  const fromPlanner = welcomeFromPlanner || Boolean(meta?.source_service_plan_id);
  const songCount = itemsQ.data?.length ?? 0;

  const copyShareLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      emitAppToast({ kind: 'success', message: 'Ссылка скопирована — отправьте её команде' });
    } catch {
      emitAppToast('Не удалось скопировать ссылку');
    }
  }, [shareUrl]);

  const shareWithTeam = useCallback(async () => {
    if (!shareUrl || !meta) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: meta.title,
          text: `Сетлист служения: ${meta.title}`,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    await copyShareLink();
  }, [shareUrl, meta, copyShareLink]);

  if (!Number.isInteger(setlistId) || setlistId <= 0) {
    return <p className="text-red-600">Некорректный id</p>;
  }

  const songbookHome = '/songbook';
  const hasVersionFor = (songId: string) =>
    (versionsQ.data ?? []).some((v) => v.song_id === songId);

  const pageCard =
    surface === 'songbook'
      ? 'rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 shadow-sm md:p-6'
      : '';

  return (
    <div className={['mx-auto max-w-3xl space-y-8', pageCard].filter(Boolean).join(' ')}>
      <Link
        to={studioSetlistsIndexPath(surface)}
        className="inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-sky-700"
      >
        <LuChevronLeft className="h-4 w-4" aria-hidden />
        Все сетлисты
      </Link>

      {fromPlanner && (
        <section
          className="overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-emerald-50/60 p-5 shadow-sm dark:border-sky-900/50 dark:from-sky-950/40 dark:via-[var(--surface-elevated)] dark:to-emerald-950/20"
          aria-labelledby="planner-setlist-welcome"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                <LuSparkles className="h-3.5 w-3.5" aria-hidden />
                Из планировщика служения
              </p>
              <h2 id="planner-setlist-welcome" className="text-lg font-bold text-[var(--text)]">
                Сетлист собран автоматически
              </h2>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {songCount > 0
                  ? `В программе ${songCount} ${songCount === 1 ? 'песня' : songCount < 5 ? 'песни' : 'песен'} из каталога. Проверьте порядок, при необходимости добавьте заметки — и отправьте ссылку команде.`
                  : 'Песни из опубликованной программы появятся здесь. Пока можно добавить их вручную из песенника.'}
              </p>
            </div>
            {meta?.is_public && shareUrl ? (
              <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                <button
                  type="button"
                  onClick={() => void shareWithTeam()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
                >
                  <LuShare2 className="h-4 w-4" aria-hidden />
                  Отправить команде
                </button>
                <button
                  type="button"
                  onClick={() => void copyShareLink()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-800 dark:text-sky-300"
                >
                  <LuCopy className="h-3.5 w-3.5" aria-hidden />
                  Копировать ссылку
                </button>
              </div>
            ) : null}
          </div>
          {meta?.is_public && shareUrl && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-sky-100 bg-white/80 px-3 py-2 dark:border-sky-900/40 dark:bg-[var(--bg-elevated)]">
              <LuLink className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
              <code className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">{shareUrl}</code>
            </div>
          )}
        </section>
      )}

      <div className="space-y-4 border-b border-[var(--border)] pb-5">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[var(--text)]">{meta?.title ?? 'Сетлист'}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {fromPlanner
              ? 'Режим выступления и PDF — для репетиции и служения.'
              : 'Сначала соберите программу, затем используйте режим выступления или экспорт PDF.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={studioSetlistPerformPath(surface, setlistId)}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-xl studio-btn-success px-5 text-base font-bold shadow-md"
          >
            <LuMic className="h-5 w-5 shrink-0" aria-hidden />
            На сцену
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
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] shadow-sm hover:bg-[var(--bg-elevated)] disabled:opacity-40"
          >
            <LuFileDown className="h-4 w-4 shrink-0" aria-hidden />
            Скачать PDF
          </button>
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="setlist-build-heading">
        <h2 id="setlist-build-heading" className="text-sm font-semibold text-[var(--text)]">
          Сборка программы
        </h2>

        <details
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]"
          open={Boolean(meta?.is_public) || fromPlanner}
        >
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-[var(--text-secondary)] marker:hidden [&::-webkit-details-marker]:hidden">
            Публичная ссылка для группы
          </summary>
          <div className="border-t border-[var(--border)] px-4 pb-4 pt-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                className="rounded border-[var(--border)] text-sky-600 focus:ring-sky-500"
                checked={Boolean(meta?.is_public)}
                onChange={(e) => publicMut.mutate(e.target.checked)}
                disabled={publicMut.isPending || !meta}
              />
              Открыть просмотр по ссылке (без входа в приложение)
            </label>
            {meta?.is_public && shareUrl && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="max-w-full truncate rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-xs text-sky-700">
                  {shareUrl}
                </code>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                  onClick={() => void copyShareLink()}
                >
                  <LuCopy className="h-3 w-3" />
                  Копировать
                </button>
              </div>
            )}
          </div>
        </details>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Добавить песню</p>
          <div className="relative mb-3">
            <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="search"
              value={songSearch}
              onChange={(e) => setSongSearch(e.target.value)}
              placeholder="Поиск по названию…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-2.5 pl-10 pr-3 text-sm text-[var(--text)] outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </div>
          {songsQ.isLoading && (
            <div className="space-y-2">
              <SkeletonBox width="42%" height="13px" />
              <SkeletonBox width="100%" height="44px" radius="10px" />
            </div>
          )}
          {songsQ.isError && (
            <p className="text-sm text-amber-700">
              Не удалось загрузить песни. Обновите страницу или проверьте подключение.
            </p>
          )}
          {!songsQ.isLoading && !songsQ.isError && songs.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)]">
              В песеннике пока нет песен — сначала добавьте их в разделе{' '}
              <Link to={songbookHome} className="font-semibold text-sky-700 hover:text-sky-800">
                Песенник
              </Link>
              .
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className="min-h-[44px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-50"
              value={pickSong}
              onChange={(e) => setPickSong(e.target.value)}
              disabled={songsQ.isLoading || songsQ.isError || songs.length === 0}
            >
              <option value="">Выберите песню</option>
              {filteredSongs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                className="rounded border-[var(--border)] text-sky-600 focus:ring-sky-500"
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
              className="studio-btn-primary min-h-[44px] disabled:opacity-50"
            >
              Добавить
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="setlist-order-heading">
        <h2 id="setlist-order-heading" className="text-sm font-semibold text-[var(--text)]">
          Порядок в программе
        </h2>
        <p className="text-xs text-[var(--text-muted)]">
          Стрелки меняют порядок. Заметки для группы — только в режиме выступления (вошедшие пользователи), не в
          публичной ссылке.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-[var(--text-secondary)]">
          {itemsQ.isLoading && (
            <li className="-ml-1 list-none space-y-2">
              <SkeletonBox width="52%" height="13px" />
              <SkeletonBox width="100%" height="60px" radius="10px" />
              <SkeletonBox width="100%" height="60px" radius="10px" />
            </li>
          )}
          {!itemsQ.isLoading && (itemsQ.data ?? []).length === 0 && (
            <li className="-ml-1 list-none rounded-xl border border-dashed border-[var(--border)] py-8 pl-4 text-sm text-[var(--text-secondary)]">
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
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] py-3 pr-3 pl-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-[var(--text-muted)]">{idx + 1}.</span>
                      <span className="font-semibold text-[var(--text)]">{it.song.title}</span>
                      {it.studio_version_id ? (
                        <span className="text-xs font-medium text-amber-700">моя версия</span>
                      ) : null}
                      {hasNotes ? (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-800">
                          заметки
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 font-mono text-xs text-[var(--text-muted)] line-clamp-2">
                      {it.effective_content_preview}
                    </p>
                  </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                      <Link
                        to={`${studioSetlistPerformPath(surface, setlistId)}?song=${idx + 1}`}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        title="Открыть в режиме выступления"
                      >
                        <LuPlay className="h-3.5 w-3.5" aria-hidden />
                        На сцену
                      </Link>
                      <div className="flex gap-0.5">
                      <button
                        type="button"
                        disabled={idx <= 0 || reorderMut.isPending}
                        onClick={() => moveItem(idx, -1)}
                        className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-30"
                        aria-label="Выше"
                      >
                        <LuArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx >= (itemsQ.data ?? []).length - 1 || reorderMut.isPending}
                        onClick={() => moveItem(idx, 1)}
                        className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-30"
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
                <details className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text)] marker:hidden [&::-webkit-details-marker]:hidden">
                    <LuMusic2 className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
                    Показать ноты
                  </summary>
                  <div className="border-t border-[var(--border)] px-3 pb-3 pt-2">
                    <SetlistSongSheetPreview
                      content={it.effective_content || it.song.content}
                      musicianNotes={it.musician_notes}
                      songKey={it.effective_key ?? it.song.default_key}
                      tempo={it.song.tempo}
                      timeSignature={it.song.time_signature}
                      compact
                    />
                  </div>
                </details>
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
