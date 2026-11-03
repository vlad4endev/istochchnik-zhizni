import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuSearch, LuTrash2 } from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';
import { emitAppToast } from '@/lib/uiFeedback';

import { deleteBibleNote, fetchBibleNotes, type BibleNote } from '../api';

function groupNotesByBook(notes: BibleNote[]): Array<{ bookName: string; notes: BibleNote[] }> {
  const order: string[] = [];
  const groups = new Map<string, BibleNote[]>();
  for (const note of notes) {
    if (!groups.has(note.book_name)) {
      groups.set(note.book_name, []);
      order.push(note.book_name);
    }
    groups.get(note.book_name)!.push(note);
  }
  // notes уже отсортированы по updated_at DESC на бэкенде — порядок групп по
  // первому вхождению сохраняет «книга с самой свежей заметкой — наверху».
  return order.map((bookName) => ({ bookName, notes: groups.get(bookName)! }));
}

export function BibleNotesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const notesQ = useQuery({
    queryKey: ['bible', 'notes', 'all'],
    queryFn: () => fetchBibleNotes(),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = notesQ.data ?? [];
    if (needle.length < 2) return all;
    return all.filter(
      (n) =>
        n.body.toLowerCase().includes(needle) ||
        n.book_name.toLowerCase().includes(needle) ||
        n.short_name.toLowerCase().includes(needle),
    );
  }, [notesQ.data, q]);

  const grouped = useMemo(() => groupNotesByBook(filtered), [filtered]);

  const delMut = useMutation({
    mutationFn: (id: number) => deleteBibleNote(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bible', 'notes'] });
      emitAppToast('Заметка удалена', 'success');
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Библия" />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-5">
        <Link to="/bible" className="text-sm font-semibold text-primary">
          ← К Библии
        </Link>

        {(notesQ.data ?? []).length > 0 ? (
          <div className="relative">
            <LuSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              size={16}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по тексту заметок"
              className="w-full rounded-2xl border border-stone-200 bg-[var(--surface-elevated)] py-2.5 pl-9 pr-3 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </div>
        ) : null}

        {(notesQ.data ?? []).length === 0 && !notesQ.isLoading ? (
          <p className="text-sm text-stone-500">Пока нет заметок. Откройте главу и нажмите на стих.</p>
        ) : null}

        {(notesQ.data ?? []).length > 0 && grouped.length === 0 ? (
          <p className="text-sm text-stone-500">Ничего не найдено</p>
        ) : null}

        {grouped.map((group) => (
          <section key={group.bookName} className="space-y-2">
            <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-stone-400">
              {group.bookName}
            </h2>
            {group.notes.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-3 rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/bible/${n.translation_code}/${n.book_slug}/${n.chapter}?v=${n.verse_start}`}
                    className="font-bold text-stone-900"
                  >
                    {n.short_name} {n.chapter}:{n.verse_start}
                    {n.verse_end !== n.verse_start ? `–${n.verse_end}` : ''}
                  </Link>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{n.body}</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-2 text-stone-400 hover:text-red-600"
                  aria-label="Удалить"
                  onClick={() => delMut.mutate(n.id)}
                >
                  <LuTrash2 size={16} />
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
