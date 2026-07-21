import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuArrowLeft, LuTrash2 } from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { keys } from '@/lib/queryKeys';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';
import { emitAppToast } from '@/lib/uiFeedback';

import { deleteSermonNote, fetchSermonNote, updateSermonNote } from '../api';

const AUTOSAVE_MS = 600;

type Draft = {
  title: string;
  topic: string;
  scripture: string;
  body: string;
};

export function SermonNoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const noteId = id ?? '';

  const noteQ = useQuery({
    queryKey: keys.sermonNote(noteId),
    queryFn: () => fetchSermonNote(noteId),
    enabled: Boolean(noteId),
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const loadedIdRef = useRef<string | null>(null);
  const skipSaveRef = useRef(true);

  useEffect(() => {
    if (!noteQ.data) return;
    if (loadedIdRef.current === noteQ.data.id) return;
    loadedIdRef.current = noteQ.data.id;
    skipSaveRef.current = true;
    setDraft({
      title: noteQ.data.title ?? '',
      topic: noteQ.data.topic ?? '',
      scripture: noteQ.data.scripture ?? '',
      body: noteQ.data.body ?? '',
    });
    setSaveState('idle');
  }, [noteQ.data]);

  const saveMut = useMutation({
    mutationFn: (patch: Draft) => updateSermonNote(noteId, patch),
    onMutate: () => setSaveState('saving'),
    onSuccess: (note) => {
      setSaveState('saved');
      void qc.setQueryData(keys.sermonNote(noteId), note);
      void qc.invalidateQueries({ queryKey: keys.sermonNotes });
    },
    onError: () => {
      setSaveState('error');
      emitAppToast('Не удалось сохранить', 'error');
    },
  });

  useEffect(() => {
    if (!draft || !noteId) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      saveMut.mutate(draft);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
    // Intentionally depend on draft fields; saveMut identity changes are ignored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, noteId]);

  const deleteMut = useMutation({
    mutationFn: () => deleteSermonNote(noteId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.sermonNotes });
      void qc.removeQueries({ queryKey: keys.sermonNote(noteId) });
      emitAppToast('Конспект удалён', 'success');
      void navigate('/my-sermons');
    },
    onError: () => {
      emitAppToast('Не удалось удалить', 'error');
    },
  });

  const saveLabel =
    saveState === 'saving'
      ? 'Сохранение…'
      : saveState === 'saved'
        ? 'Сохранено'
        : saveState === 'error'
          ? 'Ошибка сохранения'
          : '';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Конспект" />
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to="/my-sermons"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-600 hover:text-primary"
          >
            <LuArrowLeft className="h-4 w-4" aria-hidden />
            К списку
          </Link>
          <div className="flex items-center gap-3">
            {saveLabel ? (
              <span
                className={`text-xs font-medium ${
                  saveState === 'error' ? 'text-red-600' : 'text-stone-500'
                }`}
              >
                {saveLabel}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('Удалить этот конспект?')) return;
                deleteMut.mutate();
              }}
              disabled={deleteMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <LuTrash2 className="h-4 w-4" aria-hidden />
              Удалить
            </button>
          </div>
        </div>

        {noteQ.isLoading || !draft ? (
          <p className="py-10 text-center text-sm text-stone-500">Загрузка…</p>
        ) : noteQ.isError ? (
          <p className="py-10 text-center text-sm text-red-600">Конспект не найден или нет доступа.</p>
        ) : (
          <div className="flex flex-1 flex-col gap-3 pb-10">
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
              placeholder="Название конспекта"
              className="w-full border-0 border-b border-stone-200 bg-transparent py-2 text-xl font-semibold text-stone-900 outline-none placeholder:text-stone-300 focus:border-primary"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Тема
                </span>
                <input
                  type="text"
                  value={draft.topic}
                  onChange={(e) => setDraft((d) => (d ? { ...d, topic: e.target.value } : d))}
                  placeholder="Тема проповеди"
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Писание
                </span>
                <input
                  type="text"
                  value={draft.scripture}
                  onChange={(e) => setDraft((d) => (d ? { ...d, scripture: e.target.value } : d))}
                  placeholder="Например, Иоанна 3:16"
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
                />
              </label>
            </div>
            <label className="flex min-h-0 flex-1 flex-col">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                Конспект
              </span>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft((d) => (d ? { ...d, body: e.target.value } : d))}
                placeholder="Пишите план и текст проповеди…"
                rows={18}
                className="min-h-[50dvh] w-full flex-1 resize-y rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm leading-relaxed text-stone-900 outline-none ring-primary/30 placeholder:text-stone-300 focus:ring-2"
              />
            </label>
            <p className="text-xs text-stone-400">
              Полноценный редактор документов, импорт, шаринг и привязка к программе — скоро.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
