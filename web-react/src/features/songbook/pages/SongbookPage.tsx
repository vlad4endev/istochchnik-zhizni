import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuHeart, LuSearch, LuX } from 'react-icons/lu';

import { emitAppToast } from '../../../lib/uiFeedback';
import { PageHeader } from '@/components/layout/PageHeader';
import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';
import { SEMANTIC_COLORS } from '@/lib/designTokens';
import { keys } from '@/lib/queryKeys';
import { deleteFavorite, fetchSongs, postFavorite, type SongListQuery } from '../api';

export function SongbookPage() {
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();

  const [tab, setTab] = useState<'catalog' | 'favorites'>(
    sp.get('tab') === 'favorites' ? 'favorites' : 'catalog',
  );
  const [search, setSearch] = useState(sp.get('q') ?? '');
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

  useEffect(() => {
    const next = new URLSearchParams(sp);

    if (tab === 'favorites') next.set('tab', 'favorites');
    else next.delete('tab');

    const q = search.trim();
    if (q) next.set('q', q);
    else next.delete('q');

    // avoid replace-loop on same string
    if (next.toString() !== sp.toString()) {
      setSp(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search]);

  const query = useQuery({
    queryKey: [...keys.songs, queryParams] as const,
    queryFn: () => fetchSongs(queryParams),
    staleTime: 5 * 60_000,
  });

  const favoriteMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: boolean }) => {
      if (next) await postFavorite(id);
      else await deleteFavorite(id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
      emitAppToast({ kind: 'success', message: 'Избранное обновлено' });
    },
    onError: () => emitAppToast('Не удалось обновить избранное'),
  });

  const rows = useMemo(() => {
    const source = query.data ?? [];
    const tabRows = tab === 'favorites' ? source.filter((s) => s.is_favorite) : source;
    return tabRows;
  }, [query.data, tab]);

  const semanticVars: Record<`--${string}`, string> = {
    '--sb-surface': `var(--surface, ${SEMANTIC_COLORS.surface})`,
    '--sb-surface-elevated': `var(--surface-elevated, ${SEMANTIC_COLORS.surfaceElevated})`,
    '--sb-text': `var(--text, ${SEMANTIC_COLORS.text})`,
    '--sb-text-secondary': `var(--text-secondary, ${SEMANTIC_COLORS.textSecondary})`,
    '--sb-text-muted': `var(--text-muted, ${SEMANTIC_COLORS.textMuted})`,
    '--sb-border': 'var(--border, rgba(0, 0, 0, 0.08))',
    '--sb-border-hover': 'var(--border-hover, rgba(0, 0, 0, 0.16))',
    '--sb-primary': `var(--primary, ${SEMANTIC_COLORS.primary})`,
    '--sb-on-primary': 'var(--text-on-primary, #ffffff)',
    '--sb-favorite-active': SEMANTIC_COLORS.accent,
    '--sb-error': SEMANTIC_COLORS.accent,
  };

  if (query.isLoading) {
    return (
      <div style={semanticVars as CSSProperties} className="mx-auto flex h-full min-h-0 max-w-3xl flex-col text-[var(--sb-text)]">
        <div className={sectionHeroStickyClass}>
          <PageHeader title="Песенник" />
        </div>
        <div className="flex-shrink-0 border-b border-[var(--sb-border)] bg-[var(--sb-surface)]/95 px-3 py-1.5 backdrop-blur md:px-4">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <LuSearch
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sb-text-muted)]"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию или тексту…"
                autoComplete="off"
                className="w-full min-h-[40px] rounded-xl border border-[var(--sb-border)] bg-[var(--sb-surface-elevated)] py-2 pl-9 pr-9 text-sm text-[var(--sb-text)] outline-none placeholder:text-[var(--sb-text-muted)] focus:border-[var(--sb-border-hover)]"
              />
              {search.trim() ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--sb-text-muted)] hover:bg-[var(--sb-surface)] hover:text-[var(--sb-text-secondary)]"
                  aria-label="Очистить поиск"
                >
                  <LuX className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-1.5 inline-flex w-full rounded-xl bg-[var(--sb-surface)] p-1 dark:bg-[var(--bg-interactive)]">
            <button
              type="button"
              onClick={() => setTab('catalog')}
              className={[
                'min-h-[36px] flex-1 rounded-lg px-3 text-center text-sm font-semibold transition-colors',
                tab === 'catalog' ? 'bg-[var(--sb-primary)] text-[var(--sb-on-primary)]' : 'text-[var(--sb-text-secondary)]',
              ].join(' ')}
            >
              Каталог
            </button>
            <button
              type="button"
              onClick={() => setTab('favorites')}
              className={[
                'min-h-[36px] flex-1 rounded-lg px-3 text-center text-sm font-semibold transition-colors',
                tab === 'favorites' ? 'bg-[var(--sb-primary)] text-[var(--sb-on-primary)]' : 'text-[var(--sb-text-secondary)]',
              ].join(' ')}
            >
              Избранное
            </button>
          </div>
        </div>
        <div className="px-3 md:px-4">
          <SongListSkeleton />
        </div>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div style={semanticVars as CSSProperties} className="mx-auto flex h-full min-h-0 max-w-3xl flex-col gap-2 text-[var(--sb-text)]">
        <div className={sectionHeroStickyClass}>
          <PageHeader title="Песенник" />
        </div>
        <div className="flex-shrink-0 border-b border-[var(--sb-border)] bg-[var(--sb-surface)]/95 px-3 py-1.5 backdrop-blur md:px-4">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <LuSearch
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sb-text-muted)]"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию или тексту…"
                autoComplete="off"
                className="w-full min-h-[40px] rounded-xl border border-[var(--sb-border)] bg-[var(--sb-surface-elevated)] py-2 pl-9 pr-9 text-sm text-[var(--sb-text)] outline-none placeholder:text-[var(--sb-text-muted)] focus:border-[var(--sb-border-hover)]"
              />
              {search.trim() ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--sb-text-muted)] hover:bg-[var(--sb-surface)] hover:text-[var(--sb-text-secondary)]"
                  aria-label="Очистить поиск"
                >
                  <LuX className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-1.5 inline-flex w-full rounded-xl bg-[var(--sb-surface)] p-1 dark:bg-[var(--bg-interactive)]">
            <button
              type="button"
              onClick={() => setTab('catalog')}
              className={[
                'min-h-[36px] flex-1 rounded-lg px-3 text-center text-sm font-semibold transition-colors',
                tab === 'catalog' ? 'bg-[var(--sb-primary)] text-[var(--sb-on-primary)]' : 'text-[var(--sb-text-secondary)]',
              ].join(' ')}
            >
              Каталог
            </button>
            <button
              type="button"
              onClick={() => setTab('favorites')}
              className={[
                'min-h-[36px] flex-1 rounded-lg px-3 text-center text-sm font-semibold transition-colors',
                tab === 'favorites' ? 'bg-[var(--sb-primary)] text-[var(--sb-on-primary)]' : 'text-[var(--sb-text-secondary)]',
              ].join(' ')}
            >
              Избранное
            </button>
          </div>
        </div>
        <p className="px-3 text-sm text-[var(--sb-error)] md:px-4">Не удалось загрузить каталог.</p>
      </div>
    );
  }

  return (
    <div style={semanticVars as CSSProperties} className="mx-auto flex h-full min-h-0 max-w-3xl flex-col text-[var(--sb-text)]">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Песенник" />
      </div>
      <div className="flex-shrink-0 border-b border-[var(--sb-border)] bg-[var(--sb-surface)]/95 px-3 py-1.5 backdrop-blur md:px-4">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <LuSearch
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sb-text-muted)]"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию или тексту…"
              autoComplete="off"
              className="w-full min-h-[40px] rounded-xl border border-[var(--sb-border)] bg-[var(--sb-surface-elevated)] py-2 pl-9 pr-9 text-sm text-[var(--sb-text)] outline-none placeholder:text-[var(--sb-text-muted)] focus:border-[var(--sb-border-hover)]"
            />
            {search.trim() ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--sb-text-muted)] hover:bg-[var(--sb-surface)] hover:text-[var(--sb-text-secondary)]"
                aria-label="Очистить поиск"
              >
                <LuX className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-1.5 inline-flex w-full rounded-xl bg-[var(--sb-surface)] p-1 dark:bg-[var(--bg-interactive)]">
          <button
            type="button"
            onClick={() => setTab('catalog')}
            className={[
              'min-h-[36px] flex-1 rounded-lg px-3 text-center text-sm font-semibold transition-colors',
              tab === 'catalog' ? 'bg-[var(--sb-primary)] text-[var(--sb-on-primary)]' : 'text-[var(--sb-text-secondary)]',
            ].join(' ')}
          >
            Каталог
          </button>
          <button
            type="button"
            onClick={() => setTab('favorites')}
            className={[
              'min-h-[36px] flex-1 rounded-lg px-3 text-center text-sm font-semibold transition-colors',
              tab === 'favorites' ? 'bg-[var(--sb-primary)] text-[var(--sb-on-primary)]' : 'text-[var(--sb-text-secondary)]',
            ].join(' ')}
          >
            Избранное
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 [webkit-overflow-scrolling:touch] pt-1 md:px-4">
      <ul className="overflow-hidden rounded-xl border border-[var(--sb-border)] bg-[var(--sb-surface-elevated)]">
        {rows.map((s, idx) => (
          <li key={s.id} className="border-b border-[var(--sb-border)] last:border-b-0">
            <div className="flex min-h-[44px] items-center gap-2 px-2.5">
              <Link
                to={`/songbook/${s.id}`}
                className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5"
              >
                <span className="w-[22px] shrink-0 text-right text-xs font-medium text-[var(--sb-text-secondary)]">
                  {s.song_number ?? idx + 1}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-medium text-[var(--sb-text)]">{s.title}</h2>
                </div>
              </Link>
              {s.default_key ? (
                <span className="inline-flex h-6 min-w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--sb-surface)] px-2 text-xs font-semibold text-[var(--sb-primary)]">
                  {s.default_key}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => favoriteMut.mutate({ id: Number(s.id), next: !s.is_favorite })}
                disabled={favoriteMut.isPending}
                className={[
                  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                  s.is_favorite
                    ? 'text-[var(--sb-favorite-active)]'
                    : 'text-[var(--sb-text-muted)] hover:text-[var(--sb-text-secondary)]',
                ].join(' ')}
                aria-label={s.is_favorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              >
                <LuHeart className={['h-4 w-4', s.is_favorite ? 'fill-current' : ''].join(' ')} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-[var(--sb-border)] bg-[var(--sb-surface-elevated)] py-10 text-center text-sm text-[var(--sb-text-secondary)]">
          {tab === 'favorites'
            ? 'В избранном пока нет песен.'
            : debouncedSearch.trim()
              ? 'Ничего не найдено по фильтрам.'
              : 'В каталоге пока нет песен.'}
        </p>
      ) : null}
      </div>
    </div>
  );
}
