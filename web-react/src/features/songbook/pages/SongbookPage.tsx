import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Fuse, { type IFuseOptions } from 'fuse.js';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuHeart, LuPenLine, LuSearch, LuSparkles } from 'react-icons/lu';

import { useAuthStore } from '../../auth/authStore';
import { canAccessStudioRole, canModerateSongCatalog } from '../../auth/studioAccess';
import { isMainSongbookDeploy } from '../../../lib/appVariant';
import { studioEditSongPath } from '../../studio/studioPaths';
import { deleteFavorite, fetchSongs, forkInStudio, postFavorite, type SongListItem } from '../api';

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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const studioOk = canAccessStudioRole(role);
  const catalogOk = canModerateSongCatalog(role);
  const mainOnly = isMainSongbookDeploy();

  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['songs', 'catalog'],
    queryFn: () => fetchSongs(),
  });

  const docs = useMemo(() => toSearchDocs(query.data ?? []), [query.data]);
  const fuse = useMemo(() => new Fuse(docs, FUSE_OPTIONS), [docs]);

  const rows = useMemo(() => {
    const term = search.trim();
    if (!term) return docs;
    return fuse.search(term).map((r) => r.item);
  }, [docs, fuse, search]);

  const favMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: boolean }) => {
      if (next) await postFavorite(id);
      else await deleteFavorite(id);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['songs'] }),
  });

  const forkMut = useMutation({
    mutationFn: (songId: number) => forkInStudio(songId),
    onSuccess: (_, songId) => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
      navigate(studioEditSongPath('songbook', songId));
    },
  });

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
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Найти по названию, тексту, тональности, BPM…"
              autoComplete="off"
              className="w-full min-h-[52px] rounded-2xl border-0 bg-slate-50 py-3.5 pl-12 pr-4 text-base text-slate-900 shadow-[0_2px_12px_rgba(15,23,42,0.06)] outline-none ring-1 ring-slate-900/[0.06] transition placeholder:text-slate-400 focus:bg-white focus:shadow-[0_4px_20px_rgba(15,23,42,0.08)] focus:ring-slate-900/10 sm:text-[15px]"
            />
          </div>
        </label>
      </header>

      <ul className="flex flex-col gap-2.5">
        {rows.map((s) => (
          <li
            key={s.id}
            className="group relative flex items-center justify-between rounded-2xl bg-white px-5 py-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)] ring-1 ring-slate-100 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_16px_rgba(15,23,42,0.06)] hover:ring-slate-200"
          >
            <Link
              to={`/songbook/${s.id}`}
              className="flex-1 min-w-0 outline-none pr-4"
            >
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[16px] font-medium tracking-tight text-slate-900">{s.title}</h2>
                {s.has_studio_version ? (
                  <span className="shrink-0" title="Есть версия в студии">
                    <LuSparkles className="h-4 w-4 text-amber-500/80" aria-hidden />
                  </span>
                ) : null}
              </div>
            </Link>

            <div className="flex shrink-0 items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  favMut.mutate({ id: Number(s.id), next: !s.is_favorite });
                }}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                  s.is_favorite 
                    ? 'bg-rose-50 text-rose-500 hover:bg-rose-100' 
                    : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                }`}
                aria-label={s.is_favorite ? 'Убрать из избранного' : 'В избранное'}
              >
                <LuHeart className={`h-[18px] w-[18px] ${s.is_favorite ? 'fill-current' : ''}`} />
              </button>
              {!mainOnly && studioOk ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    forkMut.mutate(Number(s.id));
                  }}
                  disabled={forkMut.isPending}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                  aria-label="Редактировать в студии"
                  title="В студию"
                >
                  <LuPenLine className="h-[18px] w-[18px]" strokeWidth={2.5} />
                </button>
              ) : null}
            </div>
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
