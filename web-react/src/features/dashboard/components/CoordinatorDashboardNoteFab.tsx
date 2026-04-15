import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useId, useRef, useState } from 'react';
import { LuCross, LuHandshake, LuMegaphone, LuPlus } from 'react-icons/lu';

import {
  fetchDashboardCoordinatorNotes,
  formatCalendarDayKey,
  saveDashboardCoordinatorNote,
  type DashboardCoordinatorDuration,
  type DashboardCoordinatorNoteKind,
} from '../../calendar/api';
import { fetchMe } from '../../profile/api';

type ModalKind = DashboardCoordinatorNoteKind | null;

const DURATION_OPTIONS: Array<{ id: DashboardCoordinatorDuration; label: string }> = [
  { id: 'day', label: 'Только сегодня' },
  { id: 'week', label: 'До конца этой недели' },
  { id: 'month', label: 'До конца месяца' },
];

function kindTitle(kind: DashboardCoordinatorNoteKind): string {
  return kind === 'urgent_prayer' ? 'Срочная молитвенная нужда' : 'Объявление';
}

export function CoordinatorDashboardNoteFab() {
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ['auth', 'me'], queryFn: fetchMe, staleTime: 60_000 });
  const me = meQ.data ?? null;
  const isAdmin = me?.app_role?.trim().toLowerCase() === 'admin';
  const can =
    isAdmin || Boolean(me?.is_collection_coordinator);

  const [menuOpen, setMenuOpen] = useState(false);
  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [text, setText] = useState('');
  const [duration, setDuration] = useState<DashboardCoordinatorDuration>('day');
  const fabRef = useRef<HTMLDivElement | null>(null);
  const modalTitleId = useId();

  const saveMut = useMutation({
    mutationFn: (payload: {
      kind: DashboardCoordinatorNoteKind;
      text: string;
      duration: DashboardCoordinatorDuration;
      today_key: string;
    }) => saveDashboardCoordinatorNote(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar', 'dashboard-coordinator-notes'] });
      setModalKind(null);
      setText('');
      setDuration('day');
    },
  });

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = fabRef.current;
      if (el && !el.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  useEffect(() => {
    if (!modalKind) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saveMut.isPending) setModalKind(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalKind, saveMut.isPending]);

  if (!can) return null;

  function openModal(kind: DashboardCoordinatorNoteKind) {
    setMenuOpen(false);
    void qc
      .fetchQuery({
        queryKey: ['calendar', 'dashboard-coordinator-notes', formatCalendarDayKey(new Date())],
        queryFn: () => fetchDashboardCoordinatorNotes(formatCalendarDayKey(new Date())),
        staleTime: 30_000,
      })
      .then((data) => {
        const row = kind === 'urgent_prayer' ? data.urgent_prayer : data.announcement;
        setText(row?.text ?? '');
        setModalKind(kind);
      });
  }

  async function onSave() {
    if (!modalKind) return;
    await saveMut.mutateAsync({
      kind: modalKind,
      text,
      duration,
      today_key: formatCalendarDayKey(new Date()),
    });
  }

  return (
    <>
      <div ref={fabRef} className="pointer-events-none fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] z-[45] md:bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
        <div className="pointer-events-auto relative flex flex-col items-end gap-2">
          {menuOpen ? (
            <div
              role="menu"
              className="mb-1 min-w-[min(100vw-2rem,17rem)] overflow-hidden rounded-2xl border border-stone-200/90 bg-white py-1.5 text-sm font-semibold text-stone-800 shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-stone-50"
                onClick={() => void openModal('urgent_prayer')}
              >
                <LuHandshake className="h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden />
                Срочная молитвенная нужда
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-stone-50"
                onClick={() => void openModal('announcement')}
              >
                <LuMegaphone className="h-4 w-4 shrink-0 text-amber-700" strokeWidth={2} aria-hidden />
                Объявление
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[#6d3039] text-white shadow-[0_6px_22px_rgba(92,40,48,0.45),inset_0_0_0_1px_rgba(255,255,255,0.12)] transition hover:brightness-[1.03] active:scale-[0.97] motion-reduce:transition-none"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Добавить на главную: срочная нужда или объявление"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <LuPlus className="h-7 w-7" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>

      {modalKind ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={modalTitleId}
          onClick={() => !saveMut.isPending && setModalKind(null)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-stone-200/80 bg-white p-4 shadow-[0_24px_70px_rgba(0,0,0,0.2)] sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id={modalTitleId} className="text-lg font-extrabold tracking-tight text-stone-900">
                  {kindTitle(modalKind)}
                </p>
                <p className="mt-1 text-xs font-medium text-stone-500">
                  Текст увидят все в приложении в срок, который вы выберете. Пустое поле при сохранении убирает блок.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-stone-500 hover:bg-stone-100"
                aria-label="Закрыть"
                disabled={saveMut.isPending}
                onClick={() => setModalKind(null)}
              >
                <LuCross className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
            </div>
            <label className="mt-4 block">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-stone-500">Текст</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                maxLength={8000}
                className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-3 py-2.5 text-[15px] text-stone-900 outline-none ring-primary/15 focus:border-primary focus:ring-2 focus:ring-primary/25"
                placeholder="Введите текст…"
              />
            </label>
            <fieldset className="mt-4">
              <legend className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-stone-500">
                Срок показа
              </legend>
              <div className="mt-2 space-y-2">
                {DURATION_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-stone-200/80 bg-white px-3 py-2.5 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/[0.04]"
                  >
                    <input
                      type="radio"
                      name="dash-note-duration"
                      className="h-4 w-4 accent-primary"
                      checked={duration === opt.id}
                      onChange={() => setDuration(opt.id)}
                    />
                    <span className="text-sm font-semibold text-stone-800">{opt.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {saveMut.isError ? (
              <p className="mt-3 text-sm font-semibold text-red-600">
                {axios.isAxiosError(saveMut.error) && typeof saveMut.error.response?.data?.error === 'string'
                  ? saveMut.error.response.data.error
                  : 'Не удалось сохранить. Попробуйте ещё раз.'}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-extrabold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                disabled={saveMut.isPending}
                onClick={() => setModalKind(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 text-sm font-extrabold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60"
                disabled={saveMut.isPending}
                onClick={() => void onSave()}
              >
                {saveMut.isPending ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
