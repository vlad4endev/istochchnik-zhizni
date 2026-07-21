import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuFilePlus2, LuImport, LuSearch } from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { keys } from '@/lib/queryKeys';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';
import { emitAppToast } from '@/lib/uiFeedback';

import { createSermonNote, fetchSermonNotes, type SermonNoteListItem } from '../api';

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function noteDisplayTitle(note: SermonNoteListItem): string {
  const title = note.title.trim();
  if (title) return title;
  const topic = note.topic.trim();
  if (topic) return topic;
  return 'Без названия';
}

export function MySermonsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');

  const listQ = useQuery({
    queryKey: keys.sermonNotes,
    queryFn: fetchSermonNotes,
  });

  const createMut = useMutation({
    mutationFn: () => createSermonNote({ title: '' }),
    onSuccess: (note) => {
      void qc.invalidateQueries({ queryKey: keys.sermonNotes });
      void navigate(`/my-sermons/${note.id}`);
    },
    onError: () => {
      emitAppToast('Не удалось создать конспект', 'error');
    },
  });

  const notes = useMemo(() => (Array.isArray(listQ.data) ? listQ.data : []), [listQ.data]);

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return notes;
    return notes.filter((n) => {
      const hay = `${n.title} ${n.topic} ${n.scripture}`.toLowerCase();
      return hay.includes(t);
    });
  }, [notes, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Мои проповеди" />
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
          >
            <LuFilePlus2 className="h-4 w-4" aria-hidden />
            {createMut.isPending ? 'Создаю…' : 'Новый документ'}
          </button>
          <button
            type="button"
            disabled
            title="Скоро"
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-400"
          >
            <LuImport className="h-4 w-4" aria-hidden />
            Импорт
            <span className="text-[11px] font-semibold uppercase tracking-wide">Скоро</span>
          </button>
        </div>

        <label className="relative block">
          <LuSearch
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию, теме, Писанию…"
            className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 outline-none ring-primary/30 placeholder:text-stone-400 focus:ring-2"
          />
        </label>

        {listQ.isLoading ? (
          <p className="py-8 text-center text-sm text-stone-500">Загрузка…</p>
        ) : listQ.isError ? (
          <p className="py-8 text-center text-sm text-red-600">Не удалось загрузить конспекты.</p>
        ) : notes.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-200 bg-white/60 px-6 py-16 text-center">
            <p className="text-base font-semibold text-stone-800">Пока нет документов</p>
            <p className="max-w-sm text-sm text-stone-500">
              Создайте конспект в полноценном редакторе — с заголовками, списками, выделением и
              ссылкой «Поделиться».
            </p>
            <button
              type="button"
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <LuFilePlus2 className="h-4 w-4" aria-hidden />
              Создать документ
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-500">Ничего не найдено по запросу.</p>
        ) : (
          <ul className="flex flex-col gap-2 pb-8">
            {filtered.map((note) => (
              <li key={note.id}>
                <Link
                  to={`/my-sermons/${note.id}`}
                  className="block rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition hover:border-primary/30 hover:bg-stone-50/80"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-stone-900">{noteDisplayTitle(note)}</p>
                    {note.is_public ? (
                      <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Ссылка
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
                    {note.scripture.trim() ? <span className="truncate">{note.scripture.trim()}</span> : null}
                    {note.topic.trim() && note.topic.trim() !== note.title.trim() ? (
                      <span className="truncate">{note.topic.trim()}</span>
                    ) : null}
                    <span className="shrink-0">{formatUpdatedAt(note.updated_at)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
