import { useMutation } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useState } from 'react';
import { LuChevronDown, LuHistory, LuPencil, LuTrash2 } from 'react-icons/lu';

import {
  deleteMemberPreviousPrayerNeed,
  patchMemberPreviousPrayerNeed,
  putMemberPreviousPrayerNeed,
} from '../api';
import { loadErrorDescription } from '../prayerPageUtils';

function formatUpdatedAt(iso: string | null | undefined): string | null {
  if (iso == null || typeof iso !== 'string' || !iso.trim()) return null;
  try {
    const d = parseISO(iso.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return null;
    return format(d, 'd MMM yyyy, HH:mm', { locale: ru });
  } catch {
    return null;
  }
}

/**
 * Записи о прошлых нуждах (вручную координаторами), отдельно от текущей нужды цикла.
 * Видят только пользователи, которым показана эта панель (координаторы / админы приложения).
 */
export function CoordinatorPreviousNeedsPanel(props: {
  memberId: number;
  /** Подпись для screen reader. */
  memberLabel: string;
  items: Array<{ id: number; note: string; created_at: string }>;
  onChanged: () => void;
}) {
  const { memberId, memberLabel, items, onChanged } = props;
  const [panelOpen, setPanelOpen] = useState(false);
  const [previousNeedText, setPreviousNeedText] = useState('');
  const [editingNeedId, setEditingNeedId] = useState<number | null>(null);
  const [editingNeedText, setEditingNeedText] = useState('');

  const savePreviousNeedMut = useMutation({
    mutationFn: async () => {
      await patchMemberPreviousPrayerNeed(memberId, previousNeedText);
    },
    onSuccess: () => {
      setPreviousNeedText('');
      onChanged();
    },
  });

  const updatePreviousNeedMut = useMutation({
    mutationFn: async () => {
      if (editingNeedId == null) throw new Error('no_need_id');
      await putMemberPreviousPrayerNeed(editingNeedId, editingNeedText);
    },
    onSuccess: () => {
      setEditingNeedId(null);
      setEditingNeedText('');
      onChanged();
    },
  });

  const deletePreviousNeedMut = useMutation({
    mutationFn: async (id: number) => {
      await deleteMemberPreviousPrayerNeed(id);
    },
    onSuccess: () => {
      setEditingNeedId(null);
      setEditingNeedText('');
      onChanged();
    },
  });

  return (
    <div className="rounded-lg border border-stone-200/90 bg-white/80">
      <button
        type="button"
        onClick={() => setPanelOpen((o) => !o)}
        aria-expanded={panelOpen}
        aria-label={panelOpen ? 'Свернуть блок предыдущих нужд' : 'Показать предыдущие нужды'}
        className="flex w-full min-h-[44px] items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-stone-50/90"
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-600">
          <LuHistory className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">Предыдущие нужды</span>
          {items.length > 0 ? (
            <span className="shrink-0 rounded-full bg-stone-200/90 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-stone-700">
              {items.length}
            </span>
          ) : null}
        </span>
        <LuChevronDown
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${panelOpen ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {panelOpen ? (
        <div className="border-t border-stone-200/80 px-2 pb-2.5 pt-1">
          {items.length > 0 ? (
            <div className="space-y-1.5">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg bg-stone-50 px-2.5 py-2 ring-1 ring-stone-200/70">
                  <p className="text-[11px] font-semibold text-stone-500">
                    {formatUpdatedAt(item.created_at) ?? 'Без даты'}
                  </p>
                  {editingNeedId === item.id ? (
                    <div className="mt-1.5">
                      <textarea
                        value={editingNeedText}
                        onChange={(e) => setEditingNeedText(e.target.value)}
                        rows={2}
                        maxLength={8000}
                        className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-[13px] text-stone-800 outline-none ring-primary/15 focus:border-primary focus:ring-2"
                      />
                      <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNeedId(null);
                            setEditingNeedText('');
                          }}
                          className="min-h-[32px] rounded-md border border-stone-300 bg-white px-2 py-1 text-[11px] font-bold text-stone-700"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          disabled={updatePreviousNeedMut.isPending || !editingNeedText.trim()}
                          onClick={() => void updatePreviousNeedMut.mutateAsync()}
                          className="min-h-[32px] rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {updatePreviousNeedMut.isPending ? 'Сохр…' : 'Сохранить'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-stone-700">
                        {item.note}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNeedId(item.id);
                            setEditingNeedText(item.note);
                          }}
                          className="inline-flex min-h-[30px] items-center gap-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-[11px] font-bold text-stone-700"
                        >
                          <LuPencil className="h-3.5 w-3.5" aria-hidden />
                          Изменить
                        </button>
                        <button
                          type="button"
                          disabled={deletePreviousNeedMut.isPending}
                          onClick={() => {
                            const ok = window.confirm('Удалить эту предыдущую молитвенную нужду?');
                            if (!ok) return;
                            void deletePreviousNeedMut.mutateAsync(item.id);
                          }}
                          className="inline-flex min-h-[30px] items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <LuTrash2 className="h-3.5 w-3.5" aria-hidden />
                          Удалить
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-1 text-[12px] text-stone-400">Пока нет сохранённых предыдущих нужд.</p>
          )}
          <label className="mt-2 block">
            <span className="sr-only">Новая предыдущая нужда для {memberLabel}</span>
            <textarea
              value={previousNeedText}
              onChange={(e) => setPreviousNeedText(e.target.value)}
              rows={2}
              maxLength={8000}
              placeholder="Добавить заметку…"
              className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[13px] text-stone-800 outline-none ring-primary/15 focus:border-primary focus:ring-1"
            />
          </label>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={savePreviousNeedMut.isPending || !previousNeedText.trim()}
              onClick={() => void savePreviousNeedMut.mutateAsync()}
              className="min-h-[38px] rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-[12px] font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savePreviousNeedMut.isPending ? 'Сохранение…' : 'Сохранить как предыдущую'}
            </button>
          </div>
          {savePreviousNeedMut.isError ? (
            <p className="mt-2 text-[12px] text-red-600">
              {loadErrorDescription(savePreviousNeedMut.error) ?? 'Ошибка сохранения предыдущей нужды'}
            </p>
          ) : null}
          {updatePreviousNeedMut.isError ? (
            <p className="mt-2 text-[12px] text-red-600">
              {loadErrorDescription(updatePreviousNeedMut.error) ?? 'Ошибка изменения предыдущей нужды'}
            </p>
          ) : null}
          {deletePreviousNeedMut.isError ? (
            <p className="mt-2 text-[12px] text-red-600">
              {loadErrorDescription(deletePreviousNeedMut.error) ?? 'Ошибка удаления предыдущей нужды'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
