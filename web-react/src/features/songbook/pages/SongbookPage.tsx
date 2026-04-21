import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCheck, LuSearch, LuX } from 'react-icons/lu';

import { emitAppToast } from '../../../lib/uiFeedback';
import { deleteFavorite, fetchSongs, postFavorite } from '../api';

export function SongbookPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'catalog' | 'favorites'>('catalog');
  const [search, setSearch] = useState('');
  const [compactList, setCompactList] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem('songbook.compactList');
    return raw == null ? true : raw === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('songbook.compactList', compactList ? '1' : '0');
  }, [compactList]);

  const query = useQuery({
    queryKey: ['songs', 'catalog'],
    queryFn: () => fetchSongs(),
  });

  const favoriteMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: boolean }) => {
      if (next) await postFavorite(id);
      else await deleteFavorite(id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['songs', 'catalog'] });
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
    return <p className="text-sm text-stone-500">Загрузка песенника…</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-red-600">Не удалось загрузить каталог.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24 text-stone-900">
      <header className="sticky top-0 z-20 -mx-3 border-b border-stone-200 bg-[var(--surface)]/95 px-3 py-2 backdrop-blur md:mx-0 md:px-0">
        <label className="mb-2 block">
          <span className="sr-only">Поиск по номеру или названию</span>
          <div className="relative">
            <LuSearch
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск: номер или название"
              autoComplete="off"
              className="w-full min-h-[42px] rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-9 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-300"
            />
            {search.trim() ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                aria-label="Очистить поиск"
              >
                <LuX className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </label>
        <div className="grid grid-cols-2 overflow-hidden rounded-xl bg-stone-100">
          <button
            type="button"
            onClick={() => setTab('catalog')}
            className={[
              'min-h-[44px] text-center text-base font-medium',
              tab === 'catalog' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500',
            ].join(' ')}
          >
            Сборник
          </button>
          <button
            type="button"
            onClick={() => setTab('favorites')}
            className={[
              'min-h-[44px] text-center text-base font-medium',
              tab === 'favorites' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500',
            ].join(' ')}
          >
            Избранное
          </button>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setCompactList((v) => !v)}
            className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            {compactList ? 'Обычный список' : 'Плотный список'}
          </button>
        </div>
      </header>

      <ul className="space-y-1">
        {rows.map((s, idx) => (
          <li key={s.id} className="rounded-lg border border-stone-200 bg-white">
            <div className={['flex items-center px-3', compactList ? 'gap-2 py-1.5' : 'gap-2.5 py-2'].join(' ')}>
              <Link
                to={`/songbook/${s.id}`}
                className={['flex min-h-[44px] min-w-0 flex-1 items-center', compactList ? 'gap-2' : 'gap-3'].join(' ')}
              >
                <span
                  className={[
                    'w-7 shrink-0 text-center text-stone-500',
                    compactList ? 'text-lg font-semibold' : 'text-2xl font-medium',
                  ].join(' ')}
                >
                  {idx + 1}
                </span>
                <h2
                  className={[
                    'truncate text-stone-900',
                    compactList
                      ? 'text-sm font-semibold tracking-normal sm:text-base'
                      : 'text-lg font-semibold tracking-normal sm:text-xl',
                  ].join(' ')}
                >
                  {s.title}
                </h2>
              </Link>
              <button
                type="button"
                onClick={() => favoriteMut.mutate({ id: Number(s.id), next: !s.is_favorite })}
                disabled={favoriteMut.isPending}
                className={[
                  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                  s.is_favorite
                    ? 'border-stone-300 bg-stone-900 text-white'
                    : 'border-stone-300 text-stone-400',
                ].join(' ')}
                aria-label={s.is_favorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              >
                {s.is_favorite ? <LuCheck className="h-5 w-5" /> : null}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white py-10 text-center text-sm text-stone-500">
          {tab === 'favorites' ? 'В избранном пока нет песен.' : 'В каталоге пока нет песен.'}
        </p>
      ) : null}
    </div>
  );
}
