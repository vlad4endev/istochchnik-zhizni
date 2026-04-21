import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCheck } from 'react-icons/lu';

import { useAuthStore } from '../../auth/authStore';
import { emitAppToast } from '../../../lib/uiFeedback';
import { deleteFavorite, fetchSongs, postFavorite } from '../api';

export function SongbookPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const [tab, setTab] = useState<'catalog' | 'favorites'>('catalog');
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
    if (tab === 'favorites') return source.filter((s) => s.is_favorite);
    return source;
  }, [query.data, tab]);

  if (query.isLoading) {
    return <p className="text-sm text-stone-500">Загрузка песенника…</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-red-600">Не удалось загрузить каталог.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24 text-stone-900">
      <header className="sticky top-0 z-20 -mx-3 border-b border-stone-200 bg-[var(--surface)]/95 px-3 py-2 backdrop-blur md:mx-0 md:px-0">
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
            <div className={['flex items-center px-3', compactList ? 'gap-2 py-2' : 'gap-3 py-3'].join(' ')}>
              <Link
                to={`/songbook/${s.id}`}
                className={['flex min-h-[44px] min-w-0 flex-1 items-center', compactList ? 'gap-2' : 'gap-3'].join(' ')}
              >
                <span
                  className={[
                    'w-7 shrink-0 text-center text-stone-500',
                    compactList ? 'text-xl font-semibold' : 'text-3xl font-light',
                  ].join(' ')}
                >
                  {idx + 1}
                </span>
                <h2
                  className={[
                    'truncate text-stone-900',
                    compactList ? 'text-base font-bold tracking-normal sm:text-lg' : 'text-2xl font-extrabold uppercase tracking-wide',
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

      {role === 'admin' || role === 'editor' ? (
        <div className="pt-1">
          <Link
            to="/songbook/add"
            className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-700 hover:bg-stone-50"
          >
            Добавить песню
          </Link>
        </div>
      ) : null}
    </div>
  );
}
