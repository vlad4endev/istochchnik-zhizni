import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuFileDown, LuHeart, LuMinus, LuPlus, LuSparkles } from 'react-icons/lu';

import { useAuthStore } from '../../auth/authStore';
import { canAccessStudioRole } from '../../auth/studioAccess';
import { useWakeLock } from '../../../hooks/useWakeLock';
import { deleteFavorite, fetchSong, forkInStudio, postFavorite, recordSongOpened } from '../api';
import { LyricsWithChords } from '../components/LyricsWithChords';
import { exportSongPdf } from '../pdfExport';

export function SongDetailPage() {
  const { id } = useParams<{ id: string }>();
  const songId = Number(id);
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const token = useAuthStore((s) => s.token);
  const studioOk = canAccessStudioRole(role);

  const [transpose, setTranspose] = useState(0);

  const q = useQuery({
    queryKey: ['song', songId],
    queryFn: () => fetchSong(songId),
    enabled: Number.isInteger(songId) && songId > 0,
  });

  useWakeLock(true);

  useEffect(() => {
    if (!token || !Number.isInteger(songId) || songId <= 0) return;
    void recordSongOpened(songId).catch(() => {});
  }, [token, songId]);

  const favMut = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) await postFavorite(songId);
      else await deleteFavorite(songId);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['song', songId] }),
  });

  const forkMut = useMutation({
    mutationFn: () => forkInStudio(songId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
      window.location.href = `/studio/edit/${songId}`;
    },
  });

  const metaLine = useMemo(() => {
    if (!q.data) return '';
    const s = q.data;
    return `Тональность: ${s.default_key ?? '—'} · Темп: ${s.tempo ?? '—'} · Размер: ${s.time_signature ?? '—'}`;
  }, [q.data]);

  if (!Number.isInteger(songId) || songId <= 0) {
    return <p className="text-red-600">Некорректная ссылка</p>;
  }
  if (q.isLoading) return <p className="text-stone-500">Загрузка…</p>;
  if (q.isError || !q.data) return <p className="text-red-600">Песня не найдена</p>;

  const s = q.data;

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <Link to="/songbook" className="mb-3 inline-block text-sm text-stone-500 hover:text-stone-800">
        ← К списку
      </Link>

      <div className="sticky top-0 z-30 -mx-4 border-b border-stone-200 bg-[var(--surface)]/95 px-4 py-3 shadow-sm backdrop-blur md:-mx-0 md:px-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-bold text-stone-900 md:text-2xl">{s.title}</h1>
              {s.has_studio_version && (
                <span title="Есть индивидуальная версия в студии">
                  <LuSparkles className="h-5 w-5 shrink-0 text-amber-500" />
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-stone-600 md:text-sm">{metaLine}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-stone-600">Транспонирование</span>
            <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white">
              <button
                type="button"
                className="rounded-l-xl p-2 text-stone-700 hover:bg-stone-50"
                aria-label="Ниже"
                onClick={() => setTranspose((t) => Math.max(t - 1, -11))}
              >
                <LuMinus className="h-4 w-4" />
              </button>
              <span className="min-w-[2rem] text-center text-sm font-semibold">
                {transpose > 0 ? `+${transpose}` : transpose}
              </span>
              <button
                type="button"
                className="rounded-r-xl p-2 text-stone-700 hover:bg-stone-50"
                aria-label="Выше"
                onClick={() => setTranspose((t) => Math.min(t + 1, 11))}
              >
                <LuPlus className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                exportSongPdf({
                  title: s.title,
                  metaLine,
                  body: s.content,
                  transposeSemitones: transpose,
                  fileName: `${s.slug || 'pesnya'}.pdf`,
                })
              }
              className="inline-flex items-center gap-1 rounded-xl border border-stone-200 px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
            >
              <LuFileDown className="h-4 w-4" />
              PDF
            </button>
            <button
              type="button"
              onClick={() => favMut.mutate(!s.is_favorite)}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
            >
              <LuHeart className={`h-4 w-4 ${s.is_favorite ? 'fill-red-500 text-red-500' : ''}`} />
              {s.is_favorite ? 'В избранном' : 'Избранное'}
            </button>
            {studioOk && (
              <button
                type="button"
                onClick={() => forkMut.mutate()}
                disabled={forkMut.isPending}
                className="rounded-xl bg-stone-900 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-800"
              >
                В студии
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {s.tags?.length ? (
          <p className="text-xs text-stone-500">
            Теги:{' '}
            {s.tags.map((t) => (
              <span key={t} className="mr-2 rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">
                {t}
              </span>
            ))}
          </p>
        ) : null}
        <LyricsWithChords
          text={s.content}
          transposeSemitones={transpose}
          className="whitespace-pre-wrap rounded-2xl border border-stone-200 bg-white p-4 font-sans text-base leading-relaxed text-stone-900"
        />
      </div>
    </div>
  );
}
