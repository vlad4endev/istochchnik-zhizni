import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuArrowLeft, LuShare2, LuTrash2 } from 'react-icons/lu';

import { keys } from '@/lib/queryKeys';
import { emitAppToast } from '@/lib/uiFeedback';
import { dispatchLayoutMainChrome } from '../../../app/layoutChrome';

import {
  deleteSermonNote,
  fetchSermonNote,
  updateSermonNote,
  type SermonNote,
} from '../api';
import { bodyToEditorHtml } from '../bodyContent';
import { SermonDocEditor } from '../components/SermonDocEditor';
import { ServicePlanLinkPicker } from '../components/ServicePlanLinkPicker';
import { ShareSermonNoteModal } from '../components/ShareSermonNoteModal';

const AUTOSAVE_MS = 700;

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
  const [editorSeedHtml, setEditorSeedHtml] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [shareOpen, setShareOpen] = useState(false);
  const loadedIdRef = useRef<string | null>(null);
  const skipSaveRef = useRef(true);

  useEffect(() => {
    dispatchLayoutMainChrome(false);
    return () => dispatchLayoutMainChrome(true);
  }, []);

  useEffect(() => {
    if (!noteQ.data) return;
    if (loadedIdRef.current === noteQ.data.id) return;
    loadedIdRef.current = noteQ.data.id;
    skipSaveRef.current = true;
    const html = bodyToEditorHtml(noteQ.data.body, noteQ.data.body_format);
    setDraft({
      title: noteQ.data.title ?? '',
      topic: noteQ.data.topic ?? '',
      scripture: noteQ.data.scripture ?? '',
      body: html,
    });
    setEditorSeedHtml(html);
    setSaveState('idle');
  }, [noteQ.data]);

  const saveMut = useMutation({
    mutationFn: (patch: Draft) =>
      updateSermonNote(noteId, {
        title: patch.title,
        topic: patch.topic,
        scripture: patch.scripture,
        body: patch.body,
        body_format: 'html',
      }),
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
    onError: () => emitAppToast('Не удалось удалить', 'error'),
  });

  const linkPlanMut = useMutation({
    mutationFn: (service_plan_id: number | null) => updateSermonNote(noteId, { service_plan_id }),
    onSuccess: (updated) => {
      void qc.setQueryData(keys.sermonNote(noteId), updated);
      void qc.invalidateQueries({ queryKey: keys.sermonNotes });
      void qc.invalidateQueries({ queryKey: ['service-planner'] });
      emitAppToast(
        updated.service_plan_id
          ? 'Документ привязан к программе служения'
          : 'Привязка к программе снята',
        'success',
      );
    },
    onError: () => emitAppToast('Не удалось обновить привязку', 'error'),
  });

  const note = noteQ.data;
  const saveLabel = useMemo(() => {
    if (saveState === 'saving') return 'Сохранение…';
    if (saveState === 'saved') return 'Сохранено';
    if (saveState === 'error') return 'Ошибка сохранения';
    return '';
  }, [saveState]);

  const onNoteUpdated = (updated: SermonNote) => {
    void qc.setQueryData(keys.sermonNote(noteId), updated);
    void qc.invalidateQueries({ queryKey: keys.sermonNotes });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--surface)]">
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-3 py-2.5 sm:px-5">
          <Link
            to="/my-sermons"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-stone-600 hover:bg-stone-100 hover:text-primary"
          >
            <LuArrowLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">К списку</span>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-stone-800">
              {draft?.title.trim() || 'Без названия'}
            </p>
            {saveLabel ? (
              <p className={`text-[11px] ${saveState === 'error' ? 'text-red-600' : 'text-stone-500'}`}>
                {saveLabel}
              </p>
            ) : (
              <p className="text-[11px] text-stone-400">Автосохранение</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            disabled={!note}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            <LuShare2 className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Поделиться</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('Удалить этот документ?')) return;
              deleteMut.mutate();
            }}
            disabled={deleteMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <LuTrash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-3 py-4 sm:px-5">
        {noteQ.isLoading || !draft ? (
          <p className="py-16 text-center text-sm text-stone-500">Открываем документ…</p>
        ) : noteQ.isError ? (
          <p className="py-16 text-center text-sm text-red-600">Документ не найден или нет доступа.</p>
        ) : (
          <div className="flex flex-1 flex-col rounded-2xl border border-stone-200 bg-white px-3 py-4 shadow-sm sm:px-8 sm:py-6">
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
              placeholder="Название документа"
              className="w-full border-0 bg-transparent text-3xl font-bold tracking-tight text-stone-900 outline-none placeholder:text-stone-300"
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={draft.topic}
                onChange={(e) => setDraft((d) => (d ? { ...d, topic: e.target.value } : d))}
                placeholder="Тема проповеди"
                className="w-full rounded-lg border border-transparent bg-stone-50 px-3 py-2 text-sm text-stone-700 outline-none ring-primary/25 placeholder:text-stone-400 focus:border-stone-200 focus:bg-white focus:ring-2"
              />
              <input
                type="text"
                value={draft.scripture}
                onChange={(e) => setDraft((d) => (d ? { ...d, scripture: e.target.value } : d))}
                placeholder="Писание (например, Иоанна 3:16)"
                className="w-full rounded-lg border border-transparent bg-stone-50 px-3 py-2 text-sm text-stone-700 outline-none ring-primary/25 placeholder:text-stone-400 focus:border-stone-200 focus:bg-white focus:ring-2"
              />
            </div>
            <div className="mt-3">
              <ServicePlanLinkPicker
                value={note?.service_plan_id ?? null}
                selectedLabel={
                  note?.service_plan_id
                    ? {
                        service_date: note.plan_service_date,
                        start_time: note.plan_start_time,
                        template_name: note.plan_template_name,
                      }
                    : null
                }
                onChange={(planId) => linkPlanMut.mutate(planId)}
                disabled={linkPlanMut.isPending || !note}
              />
            </div>
            <div className="mt-4 flex-1 border-t border-stone-100 pt-3">
              <SermonDocEditor
                initialHtml={editorSeedHtml}
                onChangeHtml={(html) => setDraft((d) => (d ? { ...d, body: html } : d))}
              />
            </div>
          </div>
        )}
      </div>

      {note ? (
        <ShareSermonNoteModal
          note={note}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          onUpdated={onNoteUpdated}
        />
      ) : null}
    </div>
  );
}
