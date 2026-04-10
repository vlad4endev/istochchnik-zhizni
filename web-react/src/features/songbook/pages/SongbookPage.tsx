import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuHeart, LuSparkles } from 'react-icons/lu';

import { useAuthStore } from '../../auth/authStore';
import { canAccessStudioRole, canModerateSongCatalog } from '../../auth/studioAccess';
import { deleteFavorite, fetchSongs, forkInStudio, postFavorite, type SongListQuery } from '../api';

export function SongbookPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const studioOk = canAccessStudioRole(role);
  const catalogOk = canModerateSongCatalog(role);

  const [q, setQ] = useState('');
  const [key, setKey] = useState('');
  const [tempoMin, setTempoMin] = useState('');
  const [tempoMax, setTempoMax] = useState('');
  const [tags, setTags] = useState('');

  const filters = useMemo((): SongListQuery => {
    const f: SongListQuery = {};
    if (q.trim()) f.q = q.trim();
    if (key.trim()) f.key = key.trim();
    const tMin = Number(tempoMin);
    if (tempoMin.trim() && Number.isFinite(tMin)) f.tempoMin = tMin;
    const tMax = Number(tempoMax);
    if (tempoMax.trim() && Number.isFinite(tMax)) f.tempoMax = tMax;
    const tagList = tags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (tagList.length) f.tags = tagList;
    return f;
  }, [q, key, tempoMin, tempoMax, tags]);

  const query = useQuery({
    queryKey: ['songs', filters],
    queryFn: () => fetchSongs(filters),
  });

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
      window.location.href = `/studio/edit/${songId}`;
    },
  });

  if (query.isLoading) {
    return <p className="text-sm text-stone-500">Загрузка песенника…</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-red-600">Не удалось загрузить каталог.</p>;
  }

  const rows = query.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Песенник</h1>
          <p className="text-sm text-stone-500">Общий каталог. Личные правки — в «Моей студии».</p>
        </div>
        {catalogOk && (
          <Link
            to="/songbook/add"
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
          >
            Добавить песню
          </Link>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию и тексту…"
          className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-stone-600">
            Тональность (точное совпадение)
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="напр. Am, F"
              className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Теги (через запятую)
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="worship, kids"
              className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            BPM от
            <input
              type="number"
              value={tempoMin}
              onChange={(e) => setTempoMin(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            BPM до
            <input
              type="number"
              value={tempoMax}
              onChange={(e) => setTempoMax(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </div>

      <ul className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <Link to={`/songbook/${s.id}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-stone-900">{s.title}</span>
                {s.has_studio_version && (
                  <span title="Есть индивидуальная версия">
                    <LuSparkles className="h-4 w-4 text-amber-500" aria-hidden />
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-stone-500">
                {s.default_key ?? '—'} · {s.tempo ?? '—'} BPM · {s.time_signature ?? '—'}
                {s.tags?.length ? ` · ${s.tags.join(', ')}` : ''}
              </p>
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                favMut.mutate({ id: Number(s.id), next: !s.is_favorite });
              }}
              className="shrink-0 rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-red-500"
              aria-label={s.is_favorite ? 'Убрать из избранного' : 'В избранное'}
            >
              <LuHeart className={`h-5 w-5 ${s.is_favorite ? 'fill-red-500 text-red-500' : ''}`} />
            </button>
            {studioOk && (
              <button
                type="button"
                onClick={() => forkMut.mutate(Number(s.id))}
                disabled={forkMut.isPending}
                className="shrink-0 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                В студию
              </button>
            )}
          </li>
        ))}
      </ul>
      {rows.length === 0 && (
        <p className="text-center text-sm text-stone-500">Ничего не найдено — измените фильтры.</p>
      )}
    </div>
  );
}
