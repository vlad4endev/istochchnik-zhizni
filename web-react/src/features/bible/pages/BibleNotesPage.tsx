import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LuBookmark,
  LuCheck,
  LuNotebookPen,
  LuPenLine,
  LuTrash2,
  LuX,
} from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';
import { emitAppToast } from '@/lib/uiFeedback';

import {
  deleteBibleBookmark,
  deleteBibleNote,
  fetchBibleBookmarks,
  fetchBibleNotes,
  updateBibleNote,
} from '../api';

export function BibleNotesPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'bookmarks' ? 'bookmarks' : 'notes';
  const [editId, setEditId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState('');

  const notesQ = useQuery({
    queryKey: ['bible', 'notes', 'all'],
    queryFn: () => fetchBibleNotes(),
  });
  const bookmarksQ = useQuery({
    queryKey: ['bible', 'bookmarks', 'all'],
    queryFn: () => fetchBibleBookmarks(),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => deleteBibleNote(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bible', 'notes'] });
      emitAppToast('Заметка удалена', 'success');
    },
  });

  const delBookmarkMut = useMutation({
    mutationFn: (id: number) => deleteBibleBookmark(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bible', 'bookmarks'] });
      emitAppToast('Закладка удалена', 'success');
    },
    onError: () => emitAppToast('Не удалось удалить закладку', 'error'),
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
  const bookmarks = bookmarksQ.data ?? [];

  // Без min-h-0: корень-flex-ребёнок .page-enter с min-h-0 сжимается до высоты экрана,
  // и sticky-шапка «срывается» вверх после первого экрана прокрутки (см. BibleReaderPage).
  return (
    <div className="flex flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Библия" />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-5">
        <Link to="/bible" className="text-sm font-semibold text-primary">
          ← К Библии
        </Link>

        {/* flex, не grid-cols-2: mobile.css сводит grid в колонку на телефоне */}
        <div className="flex gap-1 rounded-2xl bg-stone-100 p-1">
          {(
            [
              ['notes', `Заметки${notes.length > 0 ? ` · ${notes.length}` : ''}`],
              ['bookmarks', `Закладки${bookmarks.length > 0 ? ` · ${bookmarks.length}` : ''}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setParams(key === 'notes' ? {} : { tab: key }, { replace: true })}
              className={[
                'flex-1 rounded-xl py-2 text-sm font-semibold transition',
                tab === key ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'bookmarks' ? (
          <>
            {bookmarks.length === 0 && !bookmarksQ.isLoading ? (
              <div className="flex flex-col items-center py-14 text-center">
                <LuBookmark className="mb-3 text-stone-300" size={36} />
                <p className="text-sm font-medium text-stone-600">Пока нет закладок</p>
                <p className="mt-1 max-w-xs text-sm text-stone-400">
                  Откройте главу, нажмите на стих и выберите «Закладка».
                </p>
              </div>
            ) : null}
            {bookmarks.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-2 rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] px-4 py-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <LuBookmark size={16} className="fill-amber-400" />
                </span>
                <Link
                  to={`/bible/${b.translation_code}/${b.book_slug}/${b.chapter}?v=${b.verse_start}`}
                  className="min-w-0 flex-1"
                >
                  <span className="block font-bold text-stone-900">
                    {b.short_name} {b.chapter}:{b.verse_start}
                    {b.verse_end !== b.verse_start ? `–${b.verse_end}` : ''}
                  </span>
                  <span className="block truncate text-xs text-stone-400">{b.book_name}</span>
                </Link>
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-2 text-stone-400 transition hover:text-red-600"
                  aria-label="Удалить закладку"
                  onClick={() => delBookmarkMut.mutate(b.id)}
                >
                  <LuTrash2 size={16} />
                </button>
              </div>
            ))}
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
