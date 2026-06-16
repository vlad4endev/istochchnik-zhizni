import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuPenLine, LuSearch, LuX } from 'react-icons/lu';

import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { keys } from '@/lib/queryKeys';
import { emitAppToast } from '../../../lib/uiFeedback';
import { useAuthStore } from '../../auth/authStore';
import { canModerateSongCatalogSession } from '../../auth/studioAccess';
import { fetchSongs, type SongListQuery } from '../../songbook/api';
import {
  fetchPublicCatalogSyncStatus,
  syncStudioToPublicCatalog,
} from '../api';
import { studioEditSongLink, useStudioEditorBackTo, useStudioModuleSurface } from '../studioPaths';

export function CatalogPage() {
  const surface = useStudioModuleSurface();
  const editorBackTo = useStudioEditorBackTo();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const canModerate = canModerateSongCatalogSession(role, roles);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 320);
    return () => clearTimeout(t);
  }, [search]);

  const queryParams = useMemo((): SongListQuery => {
    const next: SongListQuery = {};
    const q = debouncedSearch.trim();
    if (q) next.q = q;
    return next;
  }, [debouncedSearch]);

  const query = useQuery({
    queryKey: [...keys.songs, 'studio-catalog', queryParams] as const,
    queryFn: () => fetchSongs(queryParams),
    staleTime: 5 * 60_000,
  });

  const syncStatusQ = useQuery({
    queryKey: ['studio', 'public-catalog-sync-status'],
    queryFn: fetchPublicCatalogSyncStatus,
  });

  const syncProjectMut = useMutation({
    mutationFn: () => syncStudioToPublicCatalog('project'),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: keys.songs });
      void qc.invalidateQueries({ queryKey: ['studio', 'public-catalog-sync-status'] });
      const total = result.published + result.contentSynced;
      emitAppToast({
        kind: 'success',
        message:
          total > 0
            ? `В общий каталог добавлено: ${total} песен`
            : 'Все готовые песни уже в каталоге',
      });
    },
    onError: () => emitAppToast('Не удалось опубликовать песни в каталог'),
  });

  const rows = query.data ?? [];
  const hiddenInProject = syncStatusQ.data?.hiddenInProject ?? 0;
  const pageCard =
    surface === 'songbook'
      ? 'rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-6'
      : '';

  return (
    <div className={['mx-auto max-w-3xl space-y-5', pageCard].filter(Boolean).join(' ')}>
      <header className="space-y-2 border-b border-[var(--studio-editor-border)] pb-5">
        <h1 className="studio-page-heading text-2xl font-bold tracking-tight text-[var(--studio-editor-text)]">Каталог</h1>
        <p className="max-w-xl text-sm leading-relaxed text-[var(--studio-editor-mute)]">
          Все опубликованные песни проекта — от всех участников. Личные черновики и неопубликованные правки — в разделе{' '}
          <Link to={surface === 'songbook' ? '/songbook/studio' : '/studio/my-songs'} className="studio-link">
            Мои версии
          </Link>
          .
        </p>
      </header>

      {canModerate && hiddenInProject > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">В базе есть песни, которых нет в каталоге</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
            {hiddenInProject} песен с текстом ещё не опубликованы (флаг is_published или текст только в студийных версиях).
            Опубликуйте их для всего проекта.
          </p>
          <button
            type="button"
            onClick={() => syncProjectMut.mutate()}
            disabled={syncProjectMut.isPending}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {syncProjectMut.isPending ? 'Публикуем…' : 'Опубликовать все готовые песни'}
          </button>
        </div>
      ) : null}

      <div className="relative">
        <LuSearch
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--studio-editor-mute)]"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию или тексту…"
          autoComplete="off"
          className="studio-input pl-9 pr-9"
        />
        {search.trim() ? (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--studio-editor-mute)] hover:bg-[var(--studio-nav-active-bg)]/40"
            aria-label="Очистить поиск"
          >
            <LuX className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {query.isLoading ? <SongListSkeleton variant="studio" /> : null}
      {query.isError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Не удалось загрузить каталог.
        </p>
      ) : null}

      {!query.isLoading && !query.isError ? (
        <>
          <p className="text-xs text-[var(--studio-editor-mute)]">
            {rows.length > 0 ? `Песен в каталоге: ${rows.length}` : null}
          </p>
          <ul className="overflow-hidden rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)]">
            {rows.map((s, idx) => (
              <li key={s.id} className="border-b border-[var(--studio-editor-border)] last:border-b-0">
                <div className="studio-list-row flex min-h-[52px] items-center gap-2 px-3 py-2">
                  <Link
                    {...studioEditSongLink(Number(s.id), editorBackTo)}
                    className="flex min-w-0 flex-1 items-center gap-2.5"
                  >
                    <span className="w-[26px] shrink-0 text-right text-xs font-medium text-[var(--studio-editor-mute)]">
                      {s.song_number ?? idx + 1}
                    </span>
                    <span className="truncate text-sm font-medium text-[var(--studio-editor-text)] hover:text-[var(--studio-editor-accent)]">
                      {s.title}
                    </span>
                  </Link>
                  {s.default_key ? (
                    <span className="inline-flex h-6 min-w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--studio-editor-bg)] px-2 text-xs font-semibold text-[var(--studio-editor-accent)]">
                      {s.default_key}
                    </span>
                  ) : null}
                  <Link
                    {...studioEditSongLink(Number(s.id), editorBackTo)}
                    className="studio-touch-target inline-flex shrink-0 items-center justify-center rounded-lg text-[var(--studio-editor-mute)] hover:bg-[var(--studio-nav-active-bg)]/40 hover:text-[var(--studio-editor-accent)]"
                    aria-label="Открыть в редакторе"
                    title="Открыть в редакторе"
                  >
                    <LuPenLine className="h-4 w-4" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {rows.length === 0 ? (
            <p className="rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] py-10 text-center text-sm text-[var(--studio-editor-mute)]">
              {debouncedSearch.trim()
                ? 'Ничего не найдено.'
                : canModerate && hiddenInProject > 0
                  ? 'Каталог пуст: нажмите «Опубликовать все готовые песни» выше.'
                  : 'В каталоге пока нет опубликованных песен.'}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
