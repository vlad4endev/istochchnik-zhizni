import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { createSetlist, deleteSetlist, fetchSetlists } from '../api';
import { studioSetlistDetailPath, studioSetlistPerformPath, useStudioModuleSurface } from '../studioPaths';

export function SetlistsPage() {
  const surface = useStudioModuleSurface();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['studio', 'setlists'], queryFn: fetchSetlists });
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');

  const createMut = useMutation({
    mutationFn: () =>
      createSetlist(title.trim() || 'Сетлист', eventDate.trim() ? eventDate.trim() : null),
    onSuccess: () => {
      setTitle('');
      setEventDate('');
      void qc.invalidateQueries({ queryKey: ['studio', 'setlists'] });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: number) => deleteSetlist(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['studio', 'setlists'] }),
  });

  if (q.isLoading) return <p className="text-sm text-zinc-500">Загрузка…</p>;

  return (
    <div
      className={[
        'mx-auto max-w-2xl space-y-6',
        surface === 'songbook' ? 'rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-4 shadow-inner md:p-6' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <h1 className="text-lg font-semibold text-white">Сетлисты (программы)</h1>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <p className="mb-2 text-xs font-bold uppercase text-zinc-500">Новый сетлист</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            placeholder="Название"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="date"
            className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
          <button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Создать
          </button>
        </div>
      </div>
      <ul className="space-y-2">
        {(q.data ?? []).map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3"
          >
            <div>
              <Link
                to={studioSetlistDetailPath(surface, Number(s.id))}
                className="font-medium text-white hover:text-sky-400"
              >
                {s.title}
              </Link>
              {s.event_date && (
                <p className="text-xs text-zinc-500">{s.event_date}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={studioSetlistPerformPath(surface, Number(s.id))}
                className="text-sm text-emerald-400 hover:text-emerald-300"
              >
                Выступление
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Удалить сетлист?')) delMut.mutate(Number(s.id));
                }}
                className="text-xs text-red-400"
              >
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
