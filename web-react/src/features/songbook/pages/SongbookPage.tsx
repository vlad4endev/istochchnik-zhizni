import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuHeart, LuSearch, LuX } from 'react-icons/lu';

import { emitAppToast } from '../../../lib/uiFeedback';
import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { keys } from '@/lib/queryKeys';
import { useAuthStore } from '../../auth/authStore';
import { canModerateSongCatalog } from '../../auth/studioAccess';
import { deleteFavorite, fetchSongs, postFavorite } from '../api';

export function SongbookPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const canAddSong = canModerateSongCatalog(role) && (role ?? '').toLowerCase() === 'admin';
  const [tab, setTab] = useState<'catalog' | 'favorites'>('catalog');
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: keys.songs,
    queryFn: () => fetchSongs(),
    staleTime: 5 * 60_000,
  });

  const favoriteMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: boolean }) => {
      if (next) await postFavorite(id);
      else await deleteFavorite(id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.songs });
      void qc.invalidateQueries({ queryKey: ['songs', 'catalog-all'] });
      emitAppToast({ kind: 'success', message: 'Избранное обновлено' });
    },
    onError: () => emitAppToast('Не удалось обновить избранное'),
  });

  const rows = useMemo(() => {
    const source = query.data ?? [];
    const tabRows = tab === 'favorites' ? source.filter((s) => s.is_favorite) : source;
    const q = search.trim().toLowerCase();
    if (!q) return tabRows;
    return tabRows.filter((s) => {
      const number = s.song_number == null ? '' : String(s.song_number);
      const title = String(s.title ?? '').toLowerCase();
      return number.includes(q) || title.includes(q);
    });
  }, [query.data, tab, search]);

  if (query.isLoading) {
    return <SongListSkeleton />;
  }
  if (query.isError) {
    return <p className="text-sm text-red-600">Не удалось загрузить каталог.</p>;
  }

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col pb-24 text-[var(--text)]">
      <header className="flex-shrink-0 -mx-3 min-h-[126px] border-b border-stone-200/80 bg-[var(--surface)]/95 px-3 py-2 backdrop-blur md:mx-0 md:px-0">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Песенник</p>
        <label className="mb-2 block">
          <span className="sr-only">Поиск по номеру или названию</span>
          <div className="relative">
            <LuSearch
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск: номер или название"
              autoComplete="off"
              className="w-full min-h-[40px] rounded-xl border border-stone-200/70 bg-[var(--surface-elevated)] py-2 pl-9 pr-9 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-stone-300"
            />
            {search.trim() ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-secondary)]"
                aria-label="Очистить поиск"
              >
                <LuX className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </label>
        <div className="inline-flex rounded-full bg-[var(--surface)] p-0.5 dark:bg-[var(--bg-interactive)]">
          <button
            type="button"
            onClick={() => setTab('catalog')}
            className={[
              'min-h-[34px] min-w-[116px] rounded-full px-3 text-center text-sm font-medium transition-colors',
              tab === 'catalog' ? 'bg-[var(--primary)] text-[var(--text-on-primary)]' : 'text-[var(--text-secondary)]',
            ].join(' ')}
          >
            Сборник
          </button>
          <button
            type="button"
            onClick={() => setTab('favorites')}
            className={[
              'min-h-[34px] min-w-[116px] rounded-full px-3 text-center text-sm font-medium transition-colors',
              tab === 'favorites' ? 'bg-[var(--primary)] text-[var(--text-on-primary)]' : 'text-[var(--text-secondary)]',
            ].join(' ')}
          >
            Избранное
          </button>
        </div>
        <div className="mt-2 flex min-h-[34px] justify-end">
          {canAddSong ? (
            <Link
              to="/songbook/add"
              className="inline-flex min-h-[34px] items-center justify-center rounded-lg border border-stone-300 bg-[var(--surface-elevated)] px-3 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface)]"
            >
              Новая песня
            </Link>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto [webkit-overflow-scrolling:touch] pt-3">
      <ul className="overflow-hidden rounded-xl border border-stone-200/80 bg-[var(--surface-elevated)]">
        {rows.map((s, idx) => (
          <li key={s.id} className="border-b border-stone-200/70 last:border-b-0">
            <div className="flex min-h-[44px] items-center gap-2 px-2.5">
              <Link
                to={`/songbook/${s.id}`}
                className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5"
              >
                <span className="w-[22px] shrink-0 text-right text-xs font-medium text-[var(--text-secondary)]">
                  {s.song_number ?? idx + 1}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-medium text-[var(--text)]">{s.title}</h2>
                  <p className="truncate text-xs text-[var(--text-secondary)]">
                    {s.tags.find((t) => t.toLowerCase().startsWith('artist:'))?.split(':').slice(1).join(':').trim() ||
                      s.tags[0] ||
                      '—'}
                  </p>
                </div>
              </Link>
              {s.default_key ? (
                <span className="inline-flex h-6 min-w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--surface)] px-2 text-xs font-semibold text-[var(--primary)]">
                  {s.default_key}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => favoriteMut.mutate({ id: Number(s.id), next: !s.is_favorite })}
                disabled={favoriteMut.isPending}
                className={[
                  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                  s.is_favorite ? 'text-[#D64035]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
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
        <p className="rounded-xl border border-stone-200 bg-[var(--surface-elevated)] py-10 text-center text-sm text-[var(--text-secondary)]">
          {tab === 'favorites' ? 'В избранном пока нет песен.' : 'В каталоге пока нет песен.'}
        </p>
      ) : null}
      </div>
    </div>
  );
}
