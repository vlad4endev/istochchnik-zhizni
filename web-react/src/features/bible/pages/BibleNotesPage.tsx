import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuTrash2 } from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';
import { emitAppToast } from '@/lib/uiFeedback';

import { deleteBibleNote, fetchBibleNotes } from '../api';

export function BibleNotesPage() {
  const qc = useQueryClient();
  const notesQ = useQuery({
    queryKey: ['bible', 'notes', 'all'],
    queryFn: () => fetchBibleNotes(),
  });

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
        {(notesQ.data ?? []).length === 0 && !notesQ.isLoading ? (
          <p className="text-sm text-stone-500">Пока нет заметок. Откройте главу и нажмите на стих.</p>
        ) : null}
        {(notesQ.data ?? []).map((n) => (
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
      </div>
    </div>
  );
}
