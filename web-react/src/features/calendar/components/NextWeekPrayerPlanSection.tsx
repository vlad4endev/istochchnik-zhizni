import { useQuery } from '@tanstack/react-query';
import { format, parse } from 'date-fns';
import { ru } from 'date-fns/locale';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuCalendarClock, LuUsers, LuX } from 'react-icons/lu';

import type { MeResponse } from '../../profile/api';
import type { NextWeekMemberDay } from '../../../types';
import { getNextWeekMembers } from '../api';
import { loadErrorDescription } from '../prayerPageUtils';

export function userCanViewNextWeekPrayerPlan(me: MeResponse | undefined): boolean {
  if (!me) return false;
  if (me.app_role?.trim().toLowerCase() === 'admin') return true;
  return Boolean(me.is_collection_coordinator);
}

function formatNextWeekRangeLabel(days: NextWeekMemberDay[]): string {
  if (days.length < 2) return '';
  const a = parse(days[0].date, 'yyyy-MM-dd', new Date());
  const b = parse(days[days.length - 1].date, 'yyyy-MM-dd', new Date());
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${format(a, 'd', { locale: ru })}–${format(b, 'd MMMM yyyy', { locale: ru })}`;
  }
  return `${format(a, 'd MMMM yyyy', { locale: ru })} — ${format(b, 'd MMMM yyyy', { locale: ru })}`;
}

function NextWeekMembersPanel(props: {
  days: NextWeekMemberDay[] | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const sectionId = useId();
  const { days, isPending, isError, error, onRetry } = props;

  if (isPending) {
    return (
      <div aria-busy="true" aria-label="Загрузка плана на следующую неделю">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-[10px] bg-stone-200/90" />
          <div className="h-4 w-48 animate-pulse rounded bg-stone-200/90" />
        </div>
        <div className="space-y-2 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="flex justify-between gap-3 border-b border-stone-100 pb-2 last:border-0 last:pb-0"
            >
              <div className="h-4 w-28 animate-pulse rounded bg-stone-100" />
              <div className="h-4 w-32 max-w-[50%] animate-pulse rounded bg-stone-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-[14px] text-amber-950">
        <p className="font-semibold">План на следующую неделю</p>
        <p className="mt-1 text-[13px] text-amber-900/90">{loadErrorDescription(error) ?? 'Ошибка загрузки'}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-[44px] rounded-lg px-2 text-left text-[13px] font-bold text-primary underline"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!days || days.length === 0) {
    return <p className="text-center text-[14px] text-stone-500">Нет данных на следующую неделю.</p>;
  }

  const range = formatNextWeekRangeLabel(days);

  return (
    <div aria-labelledby={sectionId}>
      <div className="mb-3 flex items-center gap-3 pl-0.5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary"
          aria-hidden
        >
          <LuUsers className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 id={sectionId} className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-900">
            Следующая неделя — молитва за члена
          </h2>
          <p className="mt-0.5 text-[13px] text-stone-500">{range}</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)]">
        <ul className="divide-y divide-stone-100">
          {days.map((row) => {
            const d = parse(row.date, 'yyyy-MM-dd', new Date());
            const label = format(d, 'EEEE, d MMMM', { locale: ru });
            const name = row.member?.name?.trim() || null;
            return (
              <li
                key={row.date}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 shell:px-5"
              >
                <span className="min-w-0 shrink text-[13px] font-medium text-stone-600">{label}</span>
                <span className="text-[15px] font-semibold text-stone-900 sm:max-w-[55%] sm:text-right">
                  {name ?? '—'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ModalFrame(props: {
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { titleId, title, onClose, children } = props;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(90dvh,900px)] w-full max-w-lg flex-col rounded-t-3xl border border-stone-200/90 bg-[var(--surface)] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-200/80 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LuCalendarClock className="h-5 w-5" aria-hidden />
            </span>
            <h2 id={titleId} className="truncate text-[15px] font-extrabold text-stone-900 sm:text-base">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100"
            aria-label="Закрыть"
          >
            <LuX className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">{children}</div>
      </div>
    </div>
  );
}

type Props = { canView: boolean };

/** Кнопка и модальное окно с планом «молитва за члена» на следующую неделю — только для админов и ответственных за сбор. */
export function NextWeekPrayerPlanSection({ canView }: Props) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  const {
    data: nextWeekDays,
    isPending: nextWeekPending,
    isError: nextWeekError,
    error: nextWeekErr,
    refetch: refetchNextWeek,
  } = useQuery({
    queryKey: ['calendar', 'next-week', 'members'],
    queryFn: getNextWeekMembers,
    enabled: canView && open,
    staleTime: 5 * 60_000,
  });

  if (!canView) return null;

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="touch-manipulation flex w-full min-h-[52px] items-center gap-3 rounded-2xl border border-stone-200/90 bg-[var(--surface-elevated)] px-4 py-3 text-left shadow-[var(--shadow)] transition hover:bg-stone-50"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
          <LuCalendarClock className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-stone-900">На следующую неделю</span>
          <span className="mt-0.5 block text-[12px] text-stone-500">План молитвы за члена по дням</span>
        </span>
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <ModalFrame titleId={titleId} title="Следующая неделя" onClose={() => setOpen(false)}>
              <NextWeekMembersPanel
                days={nextWeekDays}
                isPending={nextWeekPending}
                isError={nextWeekError}
                error={nextWeekErr}
                onRetry={() => void refetchNextWeek()}
              />
            </ModalFrame>,
            document.body,
          )
        : null}
    </div>
  );
}
