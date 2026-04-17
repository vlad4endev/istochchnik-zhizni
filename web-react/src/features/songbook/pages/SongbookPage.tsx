import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Fuse, { type IFuseOptions } from 'fuse.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuSearch, LuTrash2, LuX } from 'react-icons/lu';

import { useAuthStore } from '../../auth/authStore';
import { canDeleteSongFromCatalog, canModerateSongCatalog } from '../../auth/studioAccess';
import { emitAppToast } from '../../../lib/uiFeedback';
import { isMainSongbookDeploy } from '../../../lib/appVariant';
import { deleteSong, fetchSongs, type SongListItem } from '../api';

type SongSearchDoc = SongListItem & {
  _tempoSearch: string;
};

function toSearchDocs(items: SongListItem[]): SongSearchDoc[] {
  return items.map((s) => ({
    ...s,
    _tempoSearch: s.tempo != null ? `${s.tempo} bpm ${String(s.tempo)}` : '',
  }));
}

const FUSE_OPTIONS: IFuseOptions<SongSearchDoc> = {
  keys: [
    { name: 'title', weight: 0.35 },
    { name: 'content', weight: 0.28 },
    { name: 'default_key', weight: 0.14 },
    { name: 'tags', weight: 0.1 },
    { name: 'time_signature', weight: 0.05 },
    { name: '_tempoSearch', weight: 0.08 },
  ],
  threshold: 0.38,
  ignoreLocation: true,
  distance: 200,
  minMatchCharLength: 1,
};

export function SongbookPage() {
  const role = useAuthStore((s) => s.role);
  const qc = useQueryClient();
  const catalogOk = canModerateSongCatalog(role);
  const deleteOk = canDeleteSongFromCatalog(role);
  const mainOnly = isMainSongbookDeploy();
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['songs', 'catalog'],
    queryFn: () => fetchSongs(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteSong(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['songs', 'catalog'] });
      void qc.invalidateQueries({ queryKey: ['songs', 'catalog-all'] });
      emitAppToast({ kind: 'success', message: 'Песня удалена из каталога' });
    },
    onError: () => emitAppToast('Не удалось удалить песню'),
  });

  const docs = useMemo(() => toSearchDocs(query.data ?? []), [query.data]);
  const fuse = useMemo(() => new Fuse(docs, FUSE_OPTIONS), [docs]);

  const rows = useMemo(() => {
    const term = search.trim();
    if (!term) return docs;
    return fuse.search(term).map((r) => r.item);
  }, [docs, fuse, search]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (inEditable) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (query.isLoading) {
    return <p className="text-sm text-slate-500">Загрузка песенника…</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-red-600">Не удалось загрузить каталог.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 bg-white pb-24 sm:rounded-3xl sm:bg-transparent">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Песенник</h1>
            <p className="text-sm text-slate-500">Поиск по каталогу в реальном времени</p>
          </div>
          {!mainOnly && catalogOk ? (
            <Link
              to="/songbook/add"
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Добавить песню
            </Link>
          ) : null}
        </div>

        <label className="block w-full">
          <span className="sr-only">Поиск по песеннику</span>
          <div className="relative">
            <LuSearch
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              strokeWidth={2}
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Найти по названию, тексту, тональности, BPM…"
              autoComplete="off"
              className="w-full min-h-[52px] rounded-2xl border-0 bg-slate-50 py-3.5 pl-12 pr-11 text-base text-slate-900 shadow-[0_2px_12px_rgba(15,23,42,0.06)] outline-none ring-1 ring-slate-900/[0.06] transition placeholder:text-slate-400 focus:bg-white focus:shadow-[0_4px_20px_rgba(15,23,42,0.08)] focus:ring-slate-900/10 sm:text-[15px]"
            />
            {search.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  searchRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Очистить поиск"
              >
                <LuX className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </label>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Найдено: <span className="font-semibold text-slate-700">{rows.length}</span>
          </span>
          <span className="hidden sm:inline">Нажмите `/`, чтобы быстро перейти к поиску</span>
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        {rows.map((s) => (
          <li
            key={s.id}
            className="flex min-h-[52px] items-stretch gap-1 rounded-2xl bg-slate-50/80 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition hover:bg-slate-50"
          >
            <Link
              to={`/songbook/${s.id}`}
              className="flex min-w-0 flex-1 flex-col justify-center rounded-2xl px-4 py-3 outline-none ring-offset-2 transition active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <h2 className="text-lg font-semibold leading-snug text-slate-900">
                {s.song_number != null ? `${s.song_number}. ` : ''}
                {s.title}
              </h2>
            </Link>
            {deleteOk ? (
              <button
                type="button"
                title="Удалить из каталога"
                onClick={(e) => {
                  e.preventDefault();
                  if (
                    window.confirm(
                      `Удалить «${s.title}» из каталога? Это необратимо, в том числе для сетлистов и студийных версий.`,
                    )
                  ) {
                    deleteMut.mutate(Number(s.id));
                  }
                }}
                disabled={deleteMut.isPending}
                className="inline-flex shrink-0 items-center justify-center self-stretch rounded-r-2xl px-3 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                aria-label={`Удалить «${s.title}»`}
              >
                <LuTrash2 className="h-5 w-5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 py-12 text-center text-sm text-slate-500">
          {search.trim() ? 'Ничего не найдено.' : 'В каталоге пока нет песен.'}
        </p>
      ) : null}
    </div>
  );
}
