import { useEffect, useMemo, useState } from 'react';
import { format, setDate } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuLoaderCircle, LuX } from 'react-icons/lu';

import { useIsMobile } from '../../../hooks/useIsMobile';
import { sundayDayNumbersInMonth } from '../utils/sundayScheduleTableModel';

export type SundayScheduleTableCellEdit = {
  memberId: number;
  memberName: string;
  role: 'leader' | 'preacher';
  monthStart: Date;
  monthLabel: string;
  initialDayNumbers: number[];
};

type Props = {
  edit: SundayScheduleTableCellEdit | null;
  saving?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSave: (selectedDayNumbers: number[]) => void;
};

function roleLabel(role: 'leader' | 'preacher'): string {
  return role === 'leader' ? 'Ведущий' : 'Проповедник';
}

export function SundayScheduleTableCellEditor({
  edit,
  saving = false,
  errorMessage = null,
  onClose,
  onSave,
}: Props) {
  const isMobile = useIsMobile();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const sundayDays = useMemo(
    () => (edit ? sundayDayNumbersInMonth(edit.monthStart) : []),
    [edit],
  );

  useEffect(() => {
    if (!edit) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(edit.initialDayNumbers));
  }, [edit]);

  if (!edit) return null;

  function toggleDay(day: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  const monthTitle = format(edit.monthStart, 'LLLL yyyy', { locale: ru });
  const selectedSorted = [...selected].sort((a, b) => a - b);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sunday-table-cell-editor-title"
      onClick={onClose}
    >
      <div
        className={[
          'relative z-[111] flex w-full max-w-md flex-col overflow-hidden border border-stone-200 bg-white shadow-2xl',
          isMobile ? 'max-h-[min(calc(100dvh-1rem),640px)] rounded-t-3xl' : 'rounded-2xl',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {isMobile ? <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-stone-200" /> : null}

        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-100 px-4 pb-3 pt-3 sm:pt-4">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">
              {roleLabel(edit.role)} · {edit.monthLabel}
            </p>
            <h3 id="sunday-table-cell-editor-title" className="mt-1 text-lg font-extrabold text-stone-900">
              {edit.memberName}
            </h3>
            <p className="mt-0.5 text-sm text-stone-500">
              Выберите воскресные даты в {monthTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="tap-highlight-transparent grid h-11 w-11 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600 disabled:opacity-60"
            aria-label="Закрыть"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <p className="mb-3 text-xs font-semibold text-stone-500">
            Нажмите на число, чтобы назначить или снять участие. Изменения отобразятся в таблице и календаре.
          </p>

          <div className="flex flex-wrap gap-2">
            {sundayDays.map((day) => {
              const active = selected.has(day);
              const dateIso = format(setDate(edit.monthStart, day), 'd MMMM', { locale: ru });
              return (
                <button
                  key={day}
                  type="button"
                  disabled={saving}
                  onClick={() => toggleDay(day)}
                  aria-pressed={active}
                  aria-label={`${dateIso}${active ? ', назначено' : ', не назначено'}`}
                  className={[
                    'tap-highlight-transparent inline-flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl px-3 py-2 text-sm font-extrabold transition',
                    active
                      ? 'bg-primary text-white shadow-sm ring-2 ring-primary/30'
                      : 'border border-stone-200 bg-white text-stone-800 hover:border-primary/30 hover:bg-primary/[0.04]',
                    saving ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-2.5">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">Выбрано</p>
            <p className="mt-1 text-sm font-semibold text-stone-800">
              {selectedSorted.length > 0 ? selectedSorted.join(', ') : '—'}
            </p>
          </div>

          {errorMessage ? (
            <p className="mt-3 text-sm font-semibold text-rose-600">{errorMessage}</p>
          ) : null}
        </div>

        <div
          className={
            isMobile
              ? 'border-t border-stone-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]'
              : 'flex gap-2 border-t border-stone-100 px-4 py-4'
          }
        >
          {isMobile ? (
            <div className="flex w-full flex-col gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => onSave(selectedSorted)}
                className="tap-highlight-transparent inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <LuLoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                    Сохранение…
                  </>
                ) : (
                  'Сохранить'
                )}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="tap-highlight-transparent inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-stone-200 px-4 text-sm font-bold text-stone-700"
              >
                Отмена
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => onSave(selectedSorted)}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <LuLoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                    Сохранение…
                  </>
                ) : (
                  'Сохранить'
                )}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-stone-200 px-4 text-sm font-bold text-stone-700 hover:bg-stone-50"
              >
                Отмена
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
