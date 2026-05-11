import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  LuCalendarDays,
  LuChevronLeft,
  LuChevronRight,
  LuClock,
  LuRefreshCw,
  LuTag,
} from 'react-icons/lu';

import { getActiveEvents } from '../api';
import { listOccurrencesOnLocalDay, type CalendarOccurrence } from '../eventSchedule';
import { keys } from '@/lib/queryKeys';
import { resolvePublicUrl } from '@/lib/resolvePublicUrl';

type ViewMode = 'month' | 'week' | 'day';

function capitalizeRuMonthTitle(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function EventDetailSheet({
  occurrence,
  onClose,
}: {
  occurrence: CalendarOccurrence;
  onClose: () => void;
}) {
  const { item, startsAt } = occurrence;
  const poster = resolvePublicUrl(item.poster_url ?? null);
  const whenText = format(startsAt, "EEEE, d MMMM yyyy '·' HH:mm", { locale: ru });
  const description = (item.description ?? '').trim() || 'Подробное описание скоро появится.';
  const recurrenceLabel =
    item.recurrence_type === 'weekly'
      ? `Каждую ${format(startsAt, 'EEEE', { locale: ru })}`
      : 'Разовое событие';

  return (
    <div
      className="fixed inset-0 z-[150] flex min-h-screen items-center justify-center bg-black/45 p-4 [padding-left:max(0.75rem,env(safe-area-inset-left,0px))] [padding-right:max(0.75rem,env(safe-area-inset-right,0px))]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-cal-detail-title"
    >
      <div
        className="max-h-[min(82dvh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200/80 bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-[0_24px_70px_rgba(0,0,0,0.2)] sm:max-h-[88dvh] sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] font-semibold tracking-[0.02em] text-[#0F6636]">Событие</p>
        <h2 id="event-cal-detail-title" className="mt-2 text-xl font-extrabold tracking-tight text-stone-900">
          {(item.title ?? '').trim() || 'Событие'}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[#1A9A55]">{whenText}</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-900 ring-1 ring-emerald-200/80">
            <LuCalendarDays className="h-3.5 w-3.5" aria-hidden />
            {recurrenceLabel}
          </span>
          {item.category ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700 ring-1 ring-stone-200/90">
              <LuTag className="h-3.5 w-3.5" aria-hidden />
              {item.category}
            </span>
          ) : null}
        </div>
        {poster ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200/70 bg-stone-50">
            <img src={poster} alt="" className="h-[200px] w-full object-cover sm:h-[260px]" loading="lazy" />
          </div>
        ) : null}
        <p className="mt-4 text-sm font-medium leading-relaxed text-stone-700">{description}</p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="tap-highlight-transparent inline-flex min-h-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-extrabold text-stone-700 hover:bg-stone-50"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

export function EventsCalendarPage() {
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [mode, setMode] = useState<ViewMode>('month');
  const [detail, setDetail] = useState<CalendarOccurrence | null>(null);

  const eventsQ = useQuery({
    queryKey: keys.events,
    queryFn: getActiveEvents,
    staleTime: 60_000,
  });

  const items = eventsQ.data ?? [];

  const monthGridDays = useMemo(() => {
    const monthStart = startOfMonth(cursorDate);
    const monthEnd = endOfMonth(cursorDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [cursorDate]);

  const weekDays = useMemo(() => {
    const ws = startOfWeek(cursorDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [cursorDate]);

  const dayOnly = useMemo(() => {
    const d = new Date(cursorDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [cursorDate]);

  const rangeTitle = useMemo(() => {
    if (mode === 'month') {
      return capitalizeRuMonthTitle(format(cursorDate, 'LLLL yyyy', { locale: ru }));
    }
    if (mode === 'week') {
      const a = weekDays[0];
      const b = weekDays[6];
      return `${format(a, 'd MMM', { locale: ru })} — ${format(b, 'd MMM yyyy', { locale: ru })}`;
    }
    return capitalizeRuMonthTitle(format(cursorDate, 'EEEE, d MMMM yyyy', { locale: ru }));
  }, [cursorDate, mode, weekDays]);

  const goPrev = useCallback(() => {
    setCursorDate((d) => {
      if (mode === 'month') return addMonths(d, -1);
      if (mode === 'week') return addWeeks(d, -1);
      return addDays(d, -1);
    });
  }, [mode]);

  const goNext = useCallback(() => {
    setCursorDate((d) => {
      if (mode === 'month') return addMonths(d, 1);
      if (mode === 'week') return addWeeks(d, 1);
      return addDays(d, 1);
    });
  }, [mode]);

  const goToday = useCallback(() => {
    setCursorDate(new Date());
  }, []);

  const openOccurrence = useCallback((o: CalendarOccurrence) => {
    setDetail(o);
  }, []);

  const weekdayLabelsMonFirst = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  return (
    <div className="min-h-full bg-[var(--surface)] px-3 pb-28 pt-3 sm:px-4 sm:pb-12 sm:pt-4 shell:px-6 md:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">Календарь событий</h1>
            <p className="mt-1 text-sm font-semibold text-stone-500">
              Разовые и повторяющиеся мероприятия церкви
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void eventsQ.refetch()}
              disabled={eventsQ.isFetching}
              className="tap-highlight-transparent inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-extrabold text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-60"
              aria-label="Обновить список событий"
            >
              <LuRefreshCw className={`h-4 w-4 ${eventsQ.isFetching ? 'animate-spin' : ''}`} aria-hidden />
              Обновить
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-3 rounded-2xl border border-stone-200/80 bg-white p-3 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div
            className="inline-flex w-full max-w-md rounded-2xl border border-stone-200 bg-stone-100/90 p-1 sm:w-auto"
            role="tablist"
            aria-label="Масштаб календаря"
          >
            {(
              [
                ['month', 'Месяц'],
                ['week', 'Неделя'],
                ['day', 'День'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => setMode(id)}
                className={[
                  'tap-highlight-transparent min-h-[40px] flex-1 rounded-[10px] px-3 text-sm font-extrabold transition-colors',
                  mode === id ? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-200/90' : 'text-stone-600 hover:text-stone-900',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            <p className="min-w-0 text-center text-base font-extrabold leading-tight text-stone-900 sm:text-right">{rangeTitle}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                className="tap-highlight-transparent grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50"
                aria-label="Назад"
              >
                <LuChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="tap-highlight-transparent min-h-[40px] rounded-xl border border-[#A8E4C0] bg-gradient-to-br from-[#EDFBF3] to-[#D9F5E6] px-3 text-sm font-extrabold text-[#0A2E18] hover:brightness-[1.02]"
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={goNext}
                className="tap-highlight-transparent grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50"
                aria-label="Вперёд"
              >
                <LuChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        {eventsQ.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
            Не удалось загрузить события. Проверьте соединение и попробуйте ещё раз.
          </div>
        ) : null}

        {mode === 'month' ? (
          <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
            <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50/90">
              {weekdayLabelsMonFirst.map((wd) => (
                <div key={wd} className="px-1 py-2 text-center text-[11px] font-extrabold uppercase tracking-wide text-stone-500 sm:text-xs">
                  {wd}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-stone-100">
              {monthGridDays.map((day) => {
                const inMonth = isSameMonth(day, cursorDate);
                const today = isToday(day);
                const occ = listOccurrencesOnLocalDay(day, items);
                const visible = occ.slice(0, 3);
                const more = occ.length - visible.length;
                return (
                  <div
                    key={day.toISOString()}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setCursorDate(day);
                      setMode('day');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setCursorDate(day);
                        setMode('day');
                      }
                    }}
                    className={[
                      'tap-highlight-transparent flex min-h-[96px] cursor-pointer flex-col items-stretch gap-1 bg-white p-1.5 text-left transition-colors hover:bg-emerald-50/40 sm:min-h-[112px] sm:p-2',
                      !inMonth ? 'opacity-40' : '',
                      today ? 'ring-1 ring-inset ring-[#1A9A55]/35' : '',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold sm:h-8 sm:w-8 sm:text-sm',
                        today ? 'bg-[#1A9A55] text-white' : 'text-stone-800',
                      ].join(' ')}
                    >
                      {format(day, 'd')}
                    </span>
                    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                      {eventsQ.isPending ? (
                        <span className="text-[10px] font-semibold text-stone-400">…</span>
                      ) : (
                        visible.map((o) => (
                          <button
                            key={`${o.item.id}-${o.startsAt.getTime()}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openOccurrence(o);
                            }}
                            className="tap-highlight-transparent truncate rounded-md bg-emerald-50 px-1.5 py-0.5 text-left text-[10px] font-bold leading-tight text-emerald-950 ring-1 ring-emerald-200/90 hover:bg-emerald-100 sm:text-[11px]"
                          >
                            <span className="text-emerald-700">{format(o.startsAt, 'HH:mm')}</span>{' '}
                            <span className="text-emerald-950">{(o.item.title ?? '').trim() || 'Событие'}</span>
                          </button>
                        ))
                      )}
                      {!eventsQ.isPending && more > 0 ? (
                        <span className="text-[10px] font-bold text-stone-500">+ещё {more}</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {mode === 'week' ? (
          <section className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] [-webkit-overflow-scrolling:touch]">
            <div className="grid min-w-[720px] grid-cols-7 divide-x divide-stone-100">
              {weekDays.map((day) => {
                const occ = listOccurrencesOnLocalDay(day, items);
                const today = isSameDay(day, new Date());
                return (
                  <div key={day.toISOString()} className="flex min-h-[280px] flex-col bg-white">
                    <div
                      className={[
                        'border-b border-stone-100 px-2 py-2 text-center sm:px-3',
                        today ? 'bg-emerald-50/90' : 'bg-stone-50/80',
                      ].join(' ')}
                    >
                      <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                        {format(day, 'EEE', { locale: ru })}
                      </p>
                      <p className={`mt-1 text-lg font-extrabold ${today ? 'text-[#0F6636]' : 'text-stone-900'}`}>
                        {format(day, 'd MMM', { locale: ru })}
                      </p>
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-2">
                      {eventsQ.isPending ? (
                        <p className="text-xs font-semibold text-stone-400">Загрузка…</p>
                      ) : occ.length === 0 ? (
                        <p className="text-xs font-semibold text-stone-400">Нет событий</p>
                      ) : (
                        occ.map((o) => (
                          <button
                            key={`${o.item.id}-${o.startsAt.getTime()}`}
                            type="button"
                            onClick={() => openOccurrence(o)}
                            className="tap-highlight-transparent rounded-xl border border-emerald-100 bg-gradient-to-br from-[#EDFBF3] to-white px-2.5 py-2 text-left shadow-sm ring-1 ring-emerald-100/80 transition hover:-translate-y-0.5 hover:shadow-md"
                          >
                            <p className="flex items-center gap-1 text-[11px] font-extrabold text-[#1A9A55]">
                              <LuClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {format(o.startsAt, 'HH:mm')}
                            </p>
                            <p className="mt-1 line-clamp-3 text-sm font-extrabold text-stone-900">
                              {(o.item.title ?? '').trim() || 'Событие'}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {mode === 'day' ? (
          <section className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[var(--shadow-card)] sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-100 pb-4">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">Выбранный день</p>
                <p className="mt-1 text-xl font-extrabold text-stone-900">
                  {capitalizeRuMonthTitle(format(dayOnly, 'EEEE, d MMMM yyyy', { locale: ru }))}
                </p>
              </div>
              {isToday(dayOnly) ? (
                <span className="rounded-full bg-[#1A9A55] px-2.5 py-1 text-[11px] font-extrabold text-white">Сегодня</span>
              ) : null}
            </div>
            <div className="mt-4 space-y-3">
              {eventsQ.isPending ? (
                <p className="text-sm font-semibold text-stone-500">Загрузка событий…</p>
              ) : (
                (() => {
                  const occ = listOccurrencesOnLocalDay(dayOnly, items);
                  if (occ.length === 0) {
                    return (
                      <p className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-8 text-center text-sm font-semibold text-stone-500">
                        На этот день событий нет.
                      </p>
                    );
                  }
                  return occ.map((o) => (
                    <button
                      key={`${o.item.id}-${o.startsAt.getTime()}`}
                      type="button"
                      onClick={() => openOccurrence(o)}
                      className="tap-highlight-transparent flex w-full gap-4 rounded-2xl border border-stone-200/80 bg-gradient-to-r from-white to-emerald-50/40 p-4 text-left shadow-sm ring-1 ring-stone-100 transition hover:-translate-y-0.5 hover:shadow-md sm:gap-5"
                    >
                      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#1A9A55] text-white shadow-inner">
                        <span className="text-[11px] font-bold opacity-90">Время</span>
                        <span className="text-lg font-extrabold leading-none">{format(o.startsAt, 'HH:mm')}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-extrabold text-stone-900">{(o.item.title ?? '').trim() || 'Событие'}</p>
                        <p className="mt-1 line-clamp-2 text-sm font-medium text-stone-600">
                          {(o.item.description ?? '').trim() || 'Нажмите, чтобы открыть описание.'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-emerald-900 ring-1 ring-emerald-100">
                            {o.item.recurrence_type === 'weekly' ? 'Еженедельно' : 'Разово'}
                          </span>
                          {o.item.category ? (
                            <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700 ring-1 ring-stone-200/90">
                              {o.item.category}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ));
                })()
              )}
            </div>
          </section>
        ) : null}
      </div>

      {detail && typeof document !== 'undefined'
        ? createPortal(<EventDetailSheet occurrence={detail} onClose={() => setDetail(null)} />, document.body)
        : null}
    </div>
  );
}
