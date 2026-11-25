import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuCheck, LuNotebookPen, LuPenLine, LuTrash2, LuX } from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';
import { emitAppToast } from '@/lib/uiFeedback';

import { deleteBibleNote, fetchBibleNotes, updateBibleNote } from '../api';

export function BibleNotesPage() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState('');

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

  const editMut = useMutation({
    mutationFn: (vars: { id: number; body: string }) => updateBibleNote(vars.id, { body: vars.body }),
    onSuccess: () => {
      setEditId(null);
      setEditBody('');
      void qc.invalidateQueries({ queryKey: ['bible', 'notes'] });
      emitAppToast('Заметка обновлена', 'success');
    },
    onError: () => emitAppToast('Не удалось обновить заметку', 'error'),
  });

  const notes = notesQ.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Библия" />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-5">
        <Link to="/bible" className="text-sm font-semibold text-primary">
          ← К Библии
        </Link>
        {notes.length === 0 && !notesQ.isLoading ? (
          <div className="flex flex-col items-center py-14 text-center">
            <LuNotebookPen className="mb-3 text-stone-300" size={36} />
            <p className="text-sm font-medium text-stone-600">Пока нет заметок</p>
            <p className="mt-1 max-w-xs text-sm text-stone-400">
              Откройте главу, нажмите на стих и выберите «Заметка».
            </p>
          </div>
        ) : null}
        {notes.map((n) => {
          const editing = editId === n.id;
          return (
            <div
              key={n.id}
              className="rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] px-4 py-3"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/bible/${n.translation_code}/${n.book_slug}/${n.chapter}?v=${n.verse_start}`}
                    className="font-bold text-stone-900"
                  >
                    {n.short_name} {n.chapter}:{n.verse_start}
                    {n.verse_end !== n.verse_start ? `–${n.verse_end}` : ''}
                  </Link>
                  {editing ? (
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={3}
                      className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-primary/30 placeholder:text-stone-400 focus:ring-2"
                    />
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{n.body}</p>
                  )}
                </div>
                {!editing ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="rounded-lg p-2 text-stone-400 transition hover:text-primary"
                      aria-label="Редактировать"
                      onClick={() => {
                        setEditId(n.id);
                        setEditBody(n.body);
                      }}
                    >
                      <LuPenLine size={16} />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-stone-400 transition hover:text-red-600"
                      aria-label="Удалить"
                      onClick={() => delMut.mutate(n.id)}
                    >
                      <LuTrash2 size={16} />
                    </button>
                  </div>
                ) : null}
              </div>
              {editing ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={!editBody.trim() || editMut.isPending}
                    onClick={() => editMut.mutate({ id: n.id, body: editBody })}
                  >
                    <LuCheck size={15} /> Сохранить
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-stone-500"
                    onClick={() => {
                      setEditId(null);
                      setEditBody('');
                    }}
                  >
                    <LuX size={15} /> Отмена
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
