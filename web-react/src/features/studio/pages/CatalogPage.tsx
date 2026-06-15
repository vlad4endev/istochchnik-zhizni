import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuPenLine, LuSearch, LuX } from 'react-icons/lu';

import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { keys } from '@/lib/queryKeys';
import { fetchSongs, type SongListQuery } from '../../songbook/api';
import { studioEditSongPath, useStudioModuleSurface } from '../studioPaths';

export function CatalogPage() {
  const surface = useStudioModuleSurface();
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

  const rows = query.data ?? [];
  const pageCard =
    surface === 'songbook'
      ? 'rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-6'
      : '';

  return (
    <div className={['mx-auto max-w-3xl space-y-5', pageCard].filter(Boolean).join(' ')}>
      <header className="space-y-2 border-b border-[var(--studio-editor-border)] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--studio-editor-text)]">Каталог</h1>
        <p className="max-w-xl text-sm leading-relaxed text-[var(--studio-editor-mute)]">
          Все опубликованные песни проекта — от всех участников. Личные черновики и неопубликованные правки — в разделе{' '}
          <Link to={surface === 'songbook' ? '/songbook/studio' : '/studio/my-songs'} className="font-semibold text-sky-600 hover:text-sky-700">
            Мои версии
          </Link>
          .
        </p>
      </header>

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
          className="w-full min-h-[44px] rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] py-2 pl-9 pr-9 text-sm text-[var(--studio-editor-text)] outline-none placeholder:text-[var(--studio-editor-mute)] focus:border-sky-400"
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

      {query.isLoading ? <SongListSkeleton /> : null}
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
                <div className="flex min-h-[52px] items-center gap-2 px-3 py-2">
                  <Link
                    to={studioEditSongPath(Number(s.id))}
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
                    to={studioEditSongPath(Number(s.id))}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--studio-editor-mute)] hover:bg-[var(--studio-nav-active-bg)]/40 hover:text-[var(--studio-editor-accent)]"
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
                : 'В каталоге пока нет опубликованных песен.'}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
