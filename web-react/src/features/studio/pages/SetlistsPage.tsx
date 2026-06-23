import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuChartColumnIncreasing, LuMic } from 'react-icons/lu';

import { emitAppToast } from '../../../lib/uiFeedback';
import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { createSetlist, deleteSetlist, fetchSetlists } from '../api';
import { ServicePlanSongPickButton } from '../components/ServicePlanSongPickButton';
import { studioSetlistDetailPath, studioSetlistPerformPath, studioSongUsagePath, useStudioModuleSurface } from '../studioPaths';

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

  if (q.isLoading) return <SongListSkeleton variant="studio" />;

  const inStudioShell = surface !== 'songbook';

  const pageCard =
    surface === 'songbook'
      ? 'rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 shadow-sm md:p-6'
      : '';

  return (
    <div className={['mx-auto max-w-2xl space-y-6 md:space-y-8', pageCard].filter(Boolean).join(' ')}>
      <header className={`space-y-2 border-b pb-5 ${inStudioShell ? 'border-[var(--studio-editor-border)]' : 'border-[var(--border)]'}`}>
        <h1 className={`studio-page-heading text-xl font-bold md:text-2xl ${inStudioShell ? 'text-[var(--studio-editor-text)]' : 'text-[var(--text)]'}`}>Сетлисты</h1>
        <p className={`text-sm leading-relaxed ${inStudioShell ? 'text-[var(--studio-editor-mute)]' : 'text-[var(--text-secondary)]'}`}>
          Создайте программу, добавьте песни, затем откройте выступление или PDF.
        </p>
        <Link
          to={studioSongUsagePath(surface)}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-3 text-sm font-semibold text-[var(--studio-editor-accent)] shadow-sm transition hover:bg-[var(--studio-nav-active-bg)]"
        >
          <LuChartColumnIncreasing className="h-4 w-4" aria-hidden />
          Аналитика песен в служениях
        </Link>
        <ServicePlanSongPickButton />
      </header>

      <section className="space-y-3" aria-labelledby="setlists-new-heading">
        <h2 id="setlists-new-heading" className="text-sm font-semibold text-[var(--text)]">
          Новая программа
        </h2>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Форма</p>
        <div className="flex flex-col gap-2">
          <input
            className={inStudioShell ? 'studio-input' : 'flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-sky-400 focus:ring-2 focus:ring-sky-100'}
            placeholder="Название, напр. Воскресенье утро"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="date"
            className={inStudioShell ? 'studio-input' : 'rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100'}
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
          <button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className={`min-h-[44px] w-full rounded-xl text-sm font-semibold disabled:opacity-50 sm:w-auto ${inStudioShell ? 'studio-btn-primary' : 'rounded-lg bg-[var(--primary)] px-4 py-2 text-[var(--text-on-primary)] hover:bg-[var(--primary-dark)]'}`}
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
            className={`studio-list-row flex flex-col gap-3 rounded-xl border px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between ${inStudioShell ? 'border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)]' : 'border-[var(--border)] bg-[var(--surface-elevated)]'}`}
          >
            <div className="min-w-0">
              <Link
                to={studioSetlistDetailPath(surface, Number(s.id))}
                className="font-semibold text-[var(--text)] hover:text-sky-700"
              >
                {s.title}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                {s.event_date ? <p className="text-xs text-[var(--text-muted)]">{s.event_date}</p> : null}
                {s.source_service_plan_id != null ? (
                  <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
                    Планировщик
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-sm">
              <Link
                to={studioSetlistPerformPath(surface, Number(s.id))}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-bold shadow-sm ${inStudioShell ? 'studio-btn-primary' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
              >
                <LuMic className="h-4 w-4 shrink-0" aria-hidden />
                На сцену
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Удалить сетлист?')) delMut.mutate(Number(s.id));
                }}
                className="studio-touch-target rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50"
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
