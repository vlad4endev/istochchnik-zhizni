import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { emitAppToast } from '../../../lib/uiFeedback';
import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { createSetlist, deleteSetlist, fetchSetlists } from '../api';
import { studioSetlistDetailPath, studioSetlistPerformPath, useStudioModuleSurface } from '../studioPaths';

export function SetlistsPage() {
  const surface = useStudioModuleSurface();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['studio', 'setlists'], queryFn: fetchSetlists });
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');

  const createMut = useMutation({
    mutationFn: () =>
      createSetlist(title.trim() || 'Сетлист', eventDate.trim() ? eventDate.trim() : null),
    onSuccess: (created) => {
      setTitle('');
      setEventDate('');
      void qc.invalidateQueries({ queryKey: ['studio', 'setlists'] });
      navigate(studioSetlistDetailPath(surface, Number(created.id)));
    },
    onError: () => emitAppToast('Не удалось создать сетлист'),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => deleteSetlist(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['studio', 'setlists'] }),
  });

  if (q.isLoading) return <SongListSkeleton />;

  const pageCard =
    surface === 'songbook'
      ? 'rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 shadow-sm md:p-6'
      : '';

  return (
    <div className={['mx-auto max-w-2xl space-y-8', pageCard].filter(Boolean).join(' ')}>
      <header className="space-y-2 border-b border-[var(--border)] pb-5">
        <h1 className="text-xl font-bold text-[var(--text)]">Сетлисты</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text)]">Шаг 1.</span> создайте программу здесь.{' '}
          <span className="font-medium text-[var(--text)]">Шаг 2.</span> на следующей странице добавьте песни из
          песенника, при необходимости включите «моя версия», затем откройте выступление или PDF.
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="setlists-new-heading">
        <h2 id="setlists-new-heading" className="text-sm font-semibold text-[var(--text)]">
          Новая программа
        </h2>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Форма</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            placeholder="Название, напр. Воскресенье утро"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="date"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
          <button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)] hover:bg-[var(--primary-dark)] disabled:opacity-50"
          >
            Создать и открыть
          </button>
        </div>
      </div>
      </section>

      <section className="space-y-3" aria-labelledby="setlists-list-heading">
        <h2 id="setlists-list-heading" className="text-sm font-semibold text-[var(--text)]">
          Ваши сетлисты
        </h2>
      <ul className="space-y-2">
        {(q.data ?? []).length === 0 && (
          <li className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
            Пока нет сетлистов. Создайте первый формой выше, затем добавьте песни на следующей странице.
          </li>
        )}
        {(q.data ?? []).map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 shadow-sm"
          >
            <div className="min-w-0">
              <Link
                to={studioSetlistDetailPath(surface, Number(s.id))}
                className="font-semibold text-[var(--text)] hover:text-sky-700"
              >
                {s.title}
              </Link>
              {s.event_date ? <p className="text-xs text-[var(--text-muted)]">{s.event_date}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-3 text-sm">
              <Link
                to={studioSetlistPerformPath(surface, Number(s.id))}
                className="font-medium text-emerald-700 hover:text-emerald-800"
              >
                Выступление
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Удалить сетлист?')) delMut.mutate(Number(s.id));
                }}
                className="text-xs font-medium text-red-600 hover:text-red-700"
              >
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
      </section>
    </div>
  );
}
