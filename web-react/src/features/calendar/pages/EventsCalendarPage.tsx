import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  LuBookOpen,
  LuCalendarDays,
  LuCalendarPlus,
  LuChevronLeft,
  LuChevronRight,
  LuChurch,
  LuClock,
  LuLoaderCircle,
  LuMusic2,
  LuPencil,
  LuRefreshCw,
  LuTag,
  LuUser,
} from 'react-icons/lu';

import { apiErrorMessage, updateAdminEvent } from '@/features/admin/api';
import { useAuthStore } from '@/features/auth/authStore';
import { canManageMediaSchedule } from '@/features/mediaSchedule/mediaAccess';
import { useMe } from '@/hooks/useMe';
import {
  deleteOccurrenceOverrideForDate,
  getActiveEvents,
  getCalendarSundayServices,
  getOccurrenceOverrides,
  putOccurrenceOverride,
  type ChurchEventOccurrenceOverride,
} from '../api';
import { CreateChurchEventModal } from '../components/CreateChurchEventModal';
import { SundayServiceDetailSheet } from '../components/SundayServiceDetailSheet';
import {
  listCalendarItemsOnLocalDay,
  sundayServiceSubtitle,
  upcomingSundayServices,
  type CalendarGridItem,
} from '../calendarItems';
import { listOccurrencesOnLocalDay, type CalendarOccurrence } from '../eventSchedule';
import { MediaTeamBlock } from '../../mediaSchedule/components/MediaTeamBlock';
import { resolveMediaPlanForChurchEvent } from '../../mediaSchedule/api';
import { keys } from '@/lib/queryKeys';
import { resolvePublicUrl } from '@/lib/resolvePublicUrl';
import type { CalendarSundayService } from '../sundayServiceTypes';

type ViewMode = 'month' | 'week' | 'day' | 'agenda';
type FilterMode = 'all' | 'sunday' | 'events';

/**
 * Палитры в духе дашборда (изумруд, бирюза как --theme, индиго как member, тёплые акценты).
 * Полные строки классов — для Tailwind JIT.
 */
const EVENT_TONE_STYLES = [
  {
    monthChip:
      'bg-emerald-50 ring-emerald-200/90 hover:bg-emerald-100 active:bg-emerald-100',
    monthTime: 'text-emerald-700',
    monthTitle: 'text-emerald-950',
    weekCard:
      'border-emerald-100 bg-gradient-to-br from-emerald-50/95 to-white shadow-sm ring-emerald-100/80 hover:shadow-md active:scale-[0.99]',
    weekTime: 'text-emerald-800',
    dayStripe: 'bg-emerald-600',
    dayCard:
      'border-emerald-100/90 bg-gradient-to-r from-white to-emerald-50/40 ring-emerald-100/60 hover:shadow-md active:scale-[0.995]',
    pill: 'bg-emerald-50 text-emerald-900 ring-emerald-200/90',
    detailBar:
      'border-t-[3px] border-t-emerald-500 sm:border-t-stone-200/80 sm:border-l-4 sm:border-l-emerald-500',
  },
  {
    monthChip: 'bg-teal-50 ring-teal-200/90 hover:bg-teal-100 active:bg-teal-100',
    monthTime: 'text-teal-700',
    monthTitle: 'text-teal-950',
    weekCard:
      'border-teal-100 bg-gradient-to-br from-teal-50/95 to-white shadow-sm ring-teal-100/80 hover:shadow-md active:scale-[0.99]',
    weekTime: 'text-teal-800',
    dayStripe: 'bg-teal-600',
    dayCard:
      'border-teal-100/90 bg-gradient-to-r from-white to-teal-50/40 ring-teal-100/60 hover:shadow-md active:scale-[0.995]',
    pill: 'bg-teal-50 text-teal-900 ring-teal-200/90',
    detailBar:
      'border-t-[3px] border-t-teal-500 sm:border-t-stone-200/80 sm:border-l-4 sm:border-l-teal-500',
  },
  {
    monthChip: 'bg-indigo-50 ring-indigo-200/90 hover:bg-indigo-100 active:bg-indigo-100',
    monthTime: 'text-indigo-700',
    monthTitle: 'text-indigo-950',
    weekCard:
      'border-indigo-100 bg-gradient-to-br from-indigo-50/95 to-white shadow-sm ring-indigo-100/80 hover:shadow-md active:scale-[0.99]',
    weekTime: 'text-indigo-800',
    dayStripe: 'bg-indigo-600',
    dayCard:
      'border-indigo-100/90 bg-gradient-to-r from-white to-indigo-50/40 ring-indigo-100/60 hover:shadow-md active:scale-[0.995]',
    pill: 'bg-indigo-50 text-indigo-900 ring-indigo-200/90',
    detailBar:
      'border-t-[3px] border-t-indigo-500 sm:border-t-stone-200/80 sm:border-l-4 sm:border-l-indigo-500',
  },
  {
    monthChip: 'bg-amber-50 ring-amber-200/90 hover:bg-amber-100 active:bg-amber-100',
    monthTime: 'text-amber-800',
    monthTitle: 'text-amber-950',
    weekCard:
      'border-amber-100 bg-gradient-to-br from-amber-50/95 to-white shadow-sm ring-amber-100/80 hover:shadow-md active:scale-[0.99]',
    weekTime: 'text-amber-900',
    dayStripe: 'bg-amber-600',
    dayCard:
      'border-amber-100/90 bg-gradient-to-r from-white to-amber-50/40 ring-amber-100/60 hover:shadow-md active:scale-[0.995]',
    pill: 'bg-amber-50 text-amber-950 ring-amber-200/90',
    detailBar:
      'border-t-[3px] border-t-amber-500 sm:border-t-stone-200/80 sm:border-l-4 sm:border-l-amber-500',
  },
  {
    monthChip: 'bg-rose-50 ring-rose-200/90 hover:bg-rose-100 active:bg-rose-100',
    monthTime: 'text-rose-700',
    monthTitle: 'text-rose-950',
    weekCard:
      'border-rose-100 bg-gradient-to-br from-rose-50/95 to-white shadow-sm ring-rose-100/80 hover:shadow-md active:scale-[0.99]',
    weekTime: 'text-rose-800',
    dayStripe: 'bg-rose-600',
    dayCard:
      'border-rose-100/90 bg-gradient-to-r from-white to-rose-50/40 ring-rose-100/60 hover:shadow-md active:scale-[0.995]',
    pill: 'bg-rose-50 text-rose-900 ring-rose-200/90',
    detailBar:
      'border-t-[3px] border-t-rose-500 sm:border-t-stone-200/80 sm:border-l-4 sm:border-l-rose-500',
  },
  {
    monthChip: 'bg-violet-50 ring-violet-200/90 hover:bg-violet-100 active:bg-violet-100',
    monthTime: 'text-violet-700',
    monthTitle: 'text-violet-950',
    weekCard:
      'border-violet-100 bg-gradient-to-br from-violet-50/95 to-white shadow-sm ring-violet-100/80 hover:shadow-md active:scale-[0.99]',
    weekTime: 'text-violet-800',
    dayStripe: 'bg-violet-600',
    dayCard:
      'border-violet-100/90 bg-gradient-to-r from-white to-violet-50/40 ring-violet-100/60 hover:shadow-md active:scale-[0.995]',
    pill: 'bg-violet-50 text-violet-900 ring-violet-200/90',
    detailBar:
      'border-t-[3px] border-t-violet-500 sm:border-t-stone-200/80 sm:border-l-4 sm:border-l-violet-500',
  },
] as const;

function eventToneIndex(eventId: number): number {
  const n = EVENT_TONE_STYLES.length;
  return ((eventId % n) + n) % n;
}

const SUNDAY_TONE = {
  monthChip: 'bg-[#F8EEF1] ring-[#E8D0D6] hover:bg-[#F3E3E8] active:bg-[#F3E3E8]',
  monthTime: 'text-[#6B2D3E]',
  monthTitle: 'text-[#3D1520]',
  weekCard:
    'border-[#E8D0D6] bg-gradient-to-br from-[#FBF7F8] to-white shadow-sm ring-[#E8D0D6]/80 hover:shadow-md active:scale-[0.99]',
  weekTime: 'text-[#6B2D3E]',
  dayStripe: 'bg-[#6B2D3E]',
  dayCard:
    'border-[#E8D0D6]/90 bg-gradient-to-r from-white to-[#FBF7F8] ring-[#E8D0D6]/60 hover:shadow-md active:scale-[0.995]',
  pill: 'bg-[#F8EEF1] text-[#6B2D3E] ring-[#E8D0D6]',
} as const;

function filterGridItems(items: CalendarGridItem[], filter: FilterMode): CalendarGridItem[] {
  if (filter === 'sunday') return items.filter((row) => row.kind === 'sunday');
  if (filter === 'events') return items.filter((row) => row.kind === 'event');
  return items;
}

function SundayMonthChip({
  item,
  onOpen,
}: {
  item: Extract<CalendarGridItem, { kind: 'sunday' }>;
  onOpen: (service: CalendarSundayService) => void;
}) {
  const subtitle = sundayServiceSubtitle(item.service);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item.service);
      }}
      className={[
        'tap-highlight-transparent w-full min-h-[32px] rounded-md px-1.5 py-1 text-left text-[10px] font-bold leading-tight ring-1 sm:min-h-0 sm:py-0.5 sm:text-[11px]',
        'touch-manipulation',
        SUNDAY_TONE.monthChip,
      ].join(' ')}
    >
      <span className={SUNDAY_TONE.monthTime}>{format(item.startsAt, 'HH:mm')}</span>{' '}
      <span className={SUNDAY_TONE.monthTitle}>{item.service.title}</span>
      {subtitle ? <span className="mt-0.5 block truncate font-semibold text-[#6B2D3E]/80">{subtitle}</span> : null}
    </button>
  );
}

function SundayWeekCard({
  item,
  onOpen,
  compact,
}: {
  item: Extract<CalendarGridItem, { kind: 'sunday' }>;
  onOpen: (service: CalendarSundayService) => void;
  compact?: boolean;
}) {
  const subtitle = sundayServiceSubtitle(item.service);
  return (
    <button
      type="button"
      onClick={() => onOpen(item.service)}
      className={[
        'tap-highlight-transparent w-full rounded-xl border px-3 py-3 text-left ring-1 transition sm:hover:-translate-y-0.5',
        compact ? 'px-2.5 py-2' : '',
        SUNDAY_TONE.weekCard,
      ].join(' ')}
    >
      <p className={`flex items-center gap-1.5 text-[12px] font-extrabold ${SUNDAY_TONE.weekTime}`}>
        <LuChurch className="h-4 w-4 shrink-0" aria-hidden />
        {format(item.startsAt, 'HH:mm')}
      </p>
      <p className="mt-1.5 line-clamp-2 text-[15px] font-extrabold leading-snug text-stone-900">
        {item.service.title}
      </p>
      {subtitle ? (
        <p className="mt-1 flex items-center gap-1 truncate text-[12px] font-semibold text-[#6B2D3E]">
          <LuBookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {subtitle}
        </p>
      ) : null}
      {item.service.leader?.name ? (
        <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-semibold text-stone-500">
          <LuUser className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {item.service.leader.name}
        </p>
      ) : null}
      {item.service.songs.length > 0 ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-stone-500">
          <LuMusic2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {item.service.songs.length} {item.service.songs.length === 1 ? 'песня' : 'песен'}
        </p>
      ) : null}
    </button>
  );
}

function UpcomingSundayStrip({
  services,
  onOpen,
}: {
  services: CalendarSundayService[];
  onOpen: (service: CalendarSundayService) => void;
}) {
  if (services.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-[#E8D0D6]/80 bg-gradient-to-br from-[#FBF7F8] via-white to-stone-50 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2.5 border-b border-[#E8D0D6]/50 px-3 py-3 sm:px-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#6B2D3E]/10 text-[#6B2D3E]">
          <LuChurch className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-extrabold text-stone-900 sm:text-base">Ближайшие воскресные служения</h2>
          <p className="text-[11px] font-semibold text-stone-500">Тема проповеди, песни и ведущий</p>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto p-3 sm:grid sm:grid-cols-3 sm:overflow-visible">
        {services.map((service, index) => {
          const [y, m, d] = service.service_date.split('-').map((x) => Number(x));
          const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
          const subtitle = sundayServiceSubtitle(service);
          return (
            <button
              key={`${service.id}-${service.service_date}`}
              type="button"
              onClick={() => onOpen(service)}
              className={[
                'tap-highlight-transparent min-w-[220px] flex-1 rounded-2xl border p-3 text-left shadow-sm sm:min-w-0',
                index === 0 ? 'border-[#6B2D3E]/25 bg-white ring-1 ring-[#6B2D3E]/10' : 'border-stone-200/80 bg-white/90',
              ].join(' ')}
            >
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                {Number.isNaN(dt.getTime()) ? service.service_date : format(dt, 'EEEE, d MMM', { locale: ru })}
              </p>
              <p className="mt-0.5 text-sm font-extrabold text-stone-900">{service.title}</p>
              <p className="text-xs font-semibold text-stone-500">{service.start_time}</p>
              {subtitle ? (
                <p className="mt-1.5 line-clamp-2 text-[12px] font-semibold text-[#6B2D3E]">{subtitle}</p>
              ) : null}
              {service.leader?.name ? (
                <p className="mt-1 truncate text-[11px] font-semibold text-stone-500">Ведущий: {service.leader.name}</p>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function capitalizeRuMonthTitle(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function EventDetailSheet({
  occurrence,
  onClose,
  isAdmin,
  existingOverride,
}: {
  occurrence: CalendarOccurrence;
  onClose: () => void;
  isAdmin: boolean;
  existingOverride: ChurchEventOccurrenceOverride | null;
}) {
  const queryClient = useQueryClient();
  const authRole = useAuthStore((s) => s.role);
  const authRoles = useAuthStore((s) => s.roles);
  const meQ = useMe();
  const canManageMedia = canManageMediaSchedule(authRole, meQ.data?.ministry_role, authRoles);
  const { item, startsAt, occurrenceDateKey } = occurrence;
  const tone = EVENT_TONE_STYLES[eventToneIndex(item.id)];
  const poster = resolvePublicUrl(item.poster_url ?? null);
  const whenText = format(startsAt, "EEEE, d MMMM yyyy '·' HH:mm", { locale: ru });
  const descriptionText = (item.description ?? '').trim() || 'Подробное описание скоро появится.';
  const recurrenceLabel =
    item.recurrence_type === 'weekly'
      ? `Каждую ${format(startsAt, 'EEEE', { locale: ru })}`
      : 'Разовое событие';

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventTime, setEventTime] = useState('11:00');
  const [posterUrl, setPosterUrl] = useState('');
  const [hideOnDate, setHideOnDate] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const planIdQ = useQuery({
    queryKey: ['media-schedule', 'resolve-plan', item.id, occurrenceDateKey],
    queryFn: () => resolveMediaPlanForChurchEvent(item.id, occurrenceDateKey),
  });

  const openEdit = useCallback(() => {
    setTitle((item.title ?? '').trim());
    setDescription((item.description ?? '').trim());
    setEventTime(format(startsAt, 'HH:mm'));
    setPosterUrl((item.poster_url ?? '').trim());
    setHideOnDate(existingOverride?.is_hidden ?? false);
    setLocalError(null);
    setEditing(true);
  }, [item.title, item.description, item.poster_url, startsAt, existingOverride?.is_hidden]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (item.recurrence_type === 'weekly') {
        return putOccurrenceOverride(item.id, occurrenceDateKey, {
          title: title.trim() || null,
          description: description.trim().length > 0 ? description.trim() : null,
          event_time: eventTime.trim() || null,
          poster_url: posterUrl.trim() || null,
          is_hidden: hideOnDate,
        });
      }
      return updateAdminEvent(item.id, {
        title: title.trim(),
        description: description.trim() || null,
        event_date: occurrenceDateKey,
        event_time: eventTime.trim(),
        poster_url: posterUrl.trim() || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.events });
      await queryClient.invalidateQueries({ queryKey: keys.eventOccurrenceOverrides });
      setEditing(false);
      onClose();
    },
    onError: (err: unknown) => {
      setLocalError(apiErrorMessage(err, 'Не удалось сохранить'));
    },
  });

  const resetMut = useMutation({
    mutationFn: async () => {
      await deleteOccurrenceOverrideForDate(item.id, occurrenceDateKey);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.events });
      await queryClient.invalidateQueries({ queryKey: keys.eventOccurrenceOverrides });
      setEditing(false);
      onClose();
    },
    onError: (err: unknown) => {
      setLocalError(apiErrorMessage(err, 'Не удалось сбросить правку'));
    },
  });

  return (
    <div
      className="fixed inset-0 z-[150] flex min-h-[100dvh] flex-col justify-end bg-black/50 sm:items-center sm:justify-center sm:p-4 sm:[padding-left:max(0.75rem,env(safe-area-inset-left,0px))] sm:[padding-right:max(0.75rem,env(safe-area-inset-right,0px))]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-cal-detail-title"
    >
      <div
        className={[
          'max-h-[min(90dvh,860px)] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] border border-stone-200/80 bg-white px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] shadow-[0_-8px_40px_rgba(0,0,0,0.18)] [padding-left:max(1rem,env(safe-area-inset-left,0px))] [padding-right:max(1rem,env(safe-area-inset-right,0px))] sm:rounded-2xl sm:pb-5 sm:pt-5 sm:shadow-[0_24px_70px_rgba(0,0,0,0.2)]',
          tone.detailBar,
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-stone-200/90 sm:hidden" aria-hidden />
        <p className="text-[11px] font-semibold tracking-[0.02em] text-stone-500">Мероприятие</p>
        <h2 id="event-cal-detail-title" className="mt-2 text-xl font-extrabold tracking-tight text-stone-900">
          {(item.title ?? '').trim() || 'Событие'}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className={`text-sm font-semibold ${tone.monthTime}`}>{whenText}</p>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${tone.pill}`}
          >
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

        {localError ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
            {localError}
          </p>
        ) : null}

        {editing ? (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Название</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-semibold text-stone-900"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Описание</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="mt-1 w-full resize-y rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-medium text-stone-800"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Время (ЧЧ:ММ)</span>
              <input
                type="time"
                value={eventTime.length === 5 ? eventTime : eventTime.slice(0, 5)}
                onChange={(e) => setEventTime(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-semibold text-stone-900"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Постер (URL)</span>
              <input
                type="url"
                value={posterUrl}
                onChange={(e) => setPosterUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-medium text-stone-800"
              />
            </label>
            {item.recurrence_type === 'weekly' ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-3">
                <input
                  type="checkbox"
                  checked={hideOnDate}
                  onChange={(e) => setHideOnDate(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-stone-300 text-[#1A9A55]"
                />
                <span className="text-sm font-semibold leading-snug text-stone-800">
                  Скрыть это событие только на выбранную дату ({occurrenceDateKey})
                </span>
              </label>
            ) : null}
            <p className="text-[12px] font-medium leading-snug text-stone-500">
              {item.recurrence_type === 'weekly'
                ? 'Изменения сохраняются только для этой даты в серии. Остальные недели остаются без изменений.'
                : 'Разовое событие: правки применяются к самой записи целиком.'}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              {item.recurrence_type === 'weekly' && existingOverride ? (
                <button
                  type="button"
                  disabled={resetMut.isPending || saveMut.isPending}
                  onClick={() => void resetMut.mutate()}
                  className="tap-highlight-transparent inline-flex min-h-[48px] items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-extrabold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                >
                  {resetMut.isPending ? (
                    <LuLoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    'Сбросить правку этой даты'
                  )}
                </button>
              ) : null}
              <button
                type="button"
                disabled={saveMut.isPending || resetMut.isPending}
                onClick={() => setEditing(false)}
                className="tap-highlight-transparent inline-flex min-h-[48px] items-center justify-center rounded-xl border border-stone-200 bg-white px-5 text-sm font-extrabold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={saveMut.isPending || resetMut.isPending}
                onClick={() => void saveMut.mutate()}
                className="tap-highlight-transparent inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#1A9A55] px-5 text-sm font-extrabold text-white hover:bg-[#158a4d] disabled:opacity-60"
              >
                {saveMut.isPending ? (
                  <LuLoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  'Сохранить'
                )}
              </button>
            </div>
          </div>
        ) : (
          <>
            {poster ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200/70 bg-stone-50">
                <img src={poster} alt="" className="h-[min(42vh,220px)] w-full object-cover sm:h-[260px]" loading="lazy" />
              </div>
            ) : null}
            <p className="mt-4 text-sm font-medium leading-relaxed text-stone-700">{descriptionText}</p>
            {planIdQ.data ? (
              <div className="mt-4">
                <MediaTeamBlock planId={planIdQ.data} canManage={canManageMedia} compact />
              </div>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={openEdit}
                  className="tap-highlight-transparent inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#A8E4C0] bg-gradient-to-br from-[#EDFBF3] to-[#D9F5E6] px-5 text-sm font-extrabold text-[#0A2E18] hover:brightness-[1.02]"
                >
                  <LuPencil className="h-4 w-4 shrink-0" aria-hidden />
                  Редактировать
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="tap-highlight-transparent inline-flex min-h-[48px] min-w-[120px] items-center justify-center rounded-xl border border-stone-200 bg-white px-5 text-sm font-extrabold text-stone-700 hover:bg-stone-50 active:bg-stone-100"
              >
                Закрыть
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function EventsCalendarPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const isAdmin = role === 'admin';

  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [mode, setMode] = useState<ViewMode>('month');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [detail, setDetail] = useState<CalendarOccurrence | null>(null);
  const [sundayDetail, setSundayDetail] = useState<CalendarSundayService | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const eventsQ = useQuery({
    queryKey: keys.events,
    queryFn: getActiveEvents,
    staleTime: 60_000,
  });

  const overridesQ = useQuery({
    queryKey: keys.eventOccurrenceOverrides,
    queryFn: getOccurrenceOverrides,
    staleTime: 60_000,
  });

  const sundayRange = useMemo(() => {
    const from = format(addDays(startOfMonth(addMonths(cursorDate, -1)), -7), 'yyyy-MM-dd');
    const toCursor = format(endOfMonth(addMonths(cursorDate, 2)), 'yyyy-MM-dd');
    const toToday = format(addDays(new Date(), 90), 'yyyy-MM-dd');
    return { from, to: toCursor > toToday ? toCursor : toToday };
  }, [cursorDate]);

  const sundayQ = useQuery({
    queryKey: keys.sundayServices(sundayRange.from, sundayRange.to),
    queryFn: () => getCalendarSundayServices(sundayRange),
    staleTime: 60_000,
  });

  const items = eventsQ.data ?? [];
  const occOverrides = overridesQ.data ?? [];
  const sundayServices = sundayQ.data ?? [];
  const loading = eventsQ.isPending || sundayQ.isPending;

  const itemsOnDay = useCallback(
    (day: Date) => {
      const dayKey = format(day, 'yyyy-MM-dd');
      return filterGridItems(
        listCalendarItemsOnLocalDay(day, items, occOverrides, sundayServices, dayKey),
        filter,
      );
    },
    [items, occOverrides, sundayServices, filter],
  );

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const upcomingSundays = useMemo(
    () => upcomingSundayServices(sundayServices, todayKey, 3),
    [sundayServices, todayKey],
  );

  const detailExistingOverride = useMemo(() => {
    if (!detail) return null;
    const dk = detail.occurrenceDateKey;
    return (
      occOverrides.find(
        (o) => o.event_id === detail.item.id && o.occurrence_date.slice(0, 10) === dk,
      ) ?? null
    );
  }, [detail, occOverrides]);

  useEffect(() => {
    if (!detail) return;
    const stillThere = listOccurrencesOnLocalDay(
      (() => {
        const [y, m, d] = detail.occurrenceDateKey.split('-').map((x) => Number(x));
        return new Date(y, (m ?? 1) - 1, d ?? 1);
      })(),
      items,
      occOverrides,
    ).some((o) => o.item.id === detail.item.id && o.occurrenceDateKey === detail.occurrenceDateKey);
    if (!stillThere) setDetail(null);
  }, [detail, items, occOverrides]);

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
    if (mode === 'month' || mode === 'agenda') {
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
      if (mode === 'month' || mode === 'agenda') return addMonths(d, -1);
      if (mode === 'week') return addWeeks(d, -1);
      return addDays(d, -1);
    });
  }, [mode]);

  const goNext = useCallback(() => {
    setCursorDate((d) => {
      if (mode === 'month' || mode === 'agenda') return addMonths(d, 1);
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

  const openSunday = useCallback((service: CalendarSundayService) => {
    setSundayDetail(service);
  }, []);

  const refetchAll = useCallback(() => {
    void eventsQ.refetch();
    void sundayQ.refetch();
    void overridesQ.refetch();
  }, [eventsQ, sundayQ, overridesQ]);

  const agendaDays = useMemo(() => {
    const start = startOfMonth(cursorDate);
    const end = endOfMonth(cursorDate);
    return eachDayOfInterval({ start, end });
  }, [cursorDate]);

  const weekdayLabelsMonFirst = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  return (
    <div className="min-h-full bg-[var(--surface)] px-3 pb-28 pt-3 sm:px-4 sm:pb-12 sm:pt-4 shell:px-6 md:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-3 sm:space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-stone-900 sm:text-2xl">Календарь мероприятий</h1>
            <p className="mt-1 text-[13px] font-semibold leading-snug text-stone-500 sm:text-sm">
              Воскресные служения, разовые и повторяющиеся мероприятия церкви
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="tap-highlight-transparent inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#1A9A55] px-4 text-sm font-extrabold text-white shadow-sm hover:bg-[#158a4d] active:brightness-95 sm:w-auto"
              >
                <LuCalendarPlus className="h-4 w-4 shrink-0" aria-hidden />
                Создать мероприятие
              </button>
            ) : null}
            <button
              type="button"
              onClick={refetchAll}
              disabled={eventsQ.isFetching || sundayQ.isFetching}
              className="tap-highlight-transparent inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-extrabold text-stone-700 shadow-sm hover:bg-stone-50 active:bg-stone-100 disabled:opacity-60 sm:w-auto sm:justify-start sm:px-3"
              aria-label="Обновить календарь мероприятий"
            >
              <LuRefreshCw className={`h-4 w-4 shrink-0 ${eventsQ.isFetching || sundayQ.isFetching ? 'animate-spin' : ''}`} aria-hidden />
              Обновить
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-3 rounded-2xl border border-stone-200/80 bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
          <div
            className="flex w-full rounded-2xl border border-stone-200 bg-stone-100/90 p-1"
            role="tablist"
            aria-label="Масштаб календаря"
          >
            {(
              [
                ['month', 'Месяц'],
                ['week', 'Неделя'],
                ['day', 'День'],
                ['agenda', 'Список'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => setMode(id)}
                className={[
                  'tap-highlight-transparent min-h-[44px] flex-1 rounded-[10px] px-2 text-[13px] font-extrabold transition-colors sm:min-h-[40px] sm:px-3 sm:text-sm',
                  mode === id ? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-200/90' : 'text-stone-600 hover:text-stone-900',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-center text-[15px] font-extrabold leading-snug text-stone-900 sm:flex-1 sm:text-left sm:text-base">
              {rangeTitle}
            </p>
            <div className="flex items-center justify-center gap-1.5 sm:shrink-0">
              <button
                type="button"
                onClick={goPrev}
                className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50 active:bg-stone-100"
                aria-label="Назад"
              >
                <LuChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="tap-highlight-transparent min-h-[44px] flex-1 rounded-xl border border-[#A8E4C0] bg-gradient-to-br from-[#EDFBF3] to-[#D9F5E6] px-4 text-sm font-extrabold text-[#0A2E18] hover:brightness-[1.02] active:brightness-[0.98] sm:flex-initial sm:px-3"
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={goNext}
                className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50 active:bg-stone-100"
                aria-label="Вперёд"
              >
                <LuChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>

          <div
            className="flex w-full rounded-2xl border border-stone-200 bg-stone-50/80 p-1"
            role="tablist"
            aria-label="Фильтр мероприятий"
          >
            {(
              [
                ['all', 'Все'],
                ['sunday', 'Служения'],
                ['events', 'Другие'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={[
                  'tap-highlight-transparent min-h-[40px] flex-1 rounded-[10px] px-2 text-[12px] font-extrabold transition-colors sm:text-sm',
                  filter === id ? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-200/90' : 'text-stone-600 hover:text-stone-900',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <UpcomingSundayStrip services={upcomingSundays} onOpen={openSunday} />

        {eventsQ.isError || sundayQ.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
            Не удалось загрузить календарь. Проверьте соединение и попробуйте ещё раз.
          </div>
        ) : null}

        {mode === 'month' ? (
          <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
            <p className="border-b border-stone-100 bg-stone-50/50 px-3 py-2 text-center text-[11px] font-semibold text-stone-400 sm:hidden">
              Свайпните таблицу, чтобы увидеть все дни
            </p>
            <div className="max-sm:overflow-x-auto max-sm:overscroll-x-contain max-sm:pb-1 sm:overflow-visible">
              <div>
                <div className="grid min-w-[560px] grid-cols-7 border-b border-stone-100 bg-stone-50/90 sm:min-w-0">
                  {weekdayLabelsMonFirst.map((wd) => (
                    <div
                      key={wd}
                      className={[
                        'px-0.5 py-2 text-center text-[10px] font-extrabold uppercase tracking-wide sm:px-1 sm:text-xs',
                        wd === 'Вс' ? 'text-[#6B2D3E]' : 'text-stone-500',
                      ].join(' ')}
                    >
                      {wd}
                    </div>
                  ))}
                </div>
                <div className="grid min-w-[560px] grid-cols-7 gap-px bg-stone-100 sm:min-w-0">
                  {monthGridDays.map((day) => {
                    const inMonth = isSameMonth(day, cursorDate);
                    const today = isToday(day);
                    const sunday = day.getDay() === 0;
                    const occ = itemsOnDay(day);
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
                          'tap-highlight-transparent flex min-h-[104px] cursor-pointer flex-col items-stretch gap-1 bg-white p-1.5 text-left transition-colors active:bg-stone-50 sm:min-h-[132px] sm:hover:bg-emerald-50/40 sm:p-2',
                          !inMonth ? 'opacity-40' : '',
                          today ? 'ring-1 ring-inset ring-[#1A9A55]/40' : '',
                          sunday && inMonth ? 'bg-[#FBF7F8]/70' : '',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-extrabold sm:h-8 sm:w-8 sm:text-sm',
                            today ? 'bg-[#1A9A55] text-white' : sunday ? 'text-[#6B2D3E]' : 'text-stone-800',
                          ].join(' ')}
                        >
                          {format(day, 'd')}
                        </span>
                        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden sm:gap-1">
                          {loading ? (
                            <span className="text-[10px] font-semibold text-stone-400">…</span>
                          ) : (
                            visible.map((row) => {
                              if (row.kind === 'sunday') {
                                return <SundayMonthChip key={row.key} item={row} onOpen={openSunday} />;
                              }
                              const tone = EVENT_TONE_STYLES[eventToneIndex(row.occurrence.item.id)];
                              return (
                                <button
                                  key={row.key}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openOccurrence(row.occurrence);
                                  }}
                                  className={[
                                    'tap-highlight-transparent w-full min-h-[32px] truncate rounded-md px-1.5 py-1 text-left text-[10px] font-bold leading-tight ring-1 sm:min-h-0 sm:py-0.5 sm:text-[11px]',
                                    'touch-manipulation',
                                    tone.monthChip,
                                  ].join(' ')}
                                >
                                  <span className={tone.monthTime}>{format(row.startsAt, 'HH:mm')}</span>{' '}
                                  <span className={tone.monthTitle}>
                                    {(row.occurrence.item.title ?? '').trim() || 'Мероприятие'}
                                  </span>
                                </button>
                              );
                            })
                          )}
                          {!loading && more > 0 ? (
                            <span className="text-[10px] font-bold text-stone-500">+ещё {more}</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {mode === 'week' ? (
          <>
            {/* Узкий экран: дни недели вертикально — без горизонтального скролла */}
            <section className="space-y-3 lg:hidden">
              {weekDays.map((day) => {
                const occ = itemsOnDay(day);
                const today = isSameDay(day, new Date());
                const sunday = day.getDay() === 0;
                return (
                  <div
                    key={`m-week-${day.toISOString()}`}
                    className={[
                      'overflow-hidden rounded-2xl border bg-white shadow-[var(--shadow-card)]',
                      sunday ? 'border-[#E8D0D6]/80' : 'border-stone-200/80',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setCursorDate(day);
                        setMode('day');
                      }}
                      className="tap-highlight-transparent flex w-full items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 text-left active:bg-stone-50"
                    >
                      <div>
                        <p className={`text-[11px] font-extrabold uppercase tracking-wide ${sunday ? 'text-[#6B2D3E]' : 'text-stone-500'}`}>
                          {format(day, 'EEEE', { locale: ru })}
                        </p>
                        <p className={`mt-0.5 text-lg font-extrabold ${today ? 'text-[#0F6636]' : 'text-stone-900'}`}>
                          {format(day, 'd MMMM', { locale: ru })}
                        </p>
                      </div>
                      <span className="shrink-0 text-[12px] font-bold text-primary">День →</span>
                    </button>
                    <div className="space-y-2 p-3">
                      {loading ? (
                        <p className="text-sm font-semibold text-stone-400">Загрузка…</p>
                      ) : occ.length === 0 ? (
                        <p className="rounded-xl bg-stone-50 px-3 py-3 text-center text-sm font-semibold text-stone-500">
                          Нет мероприятий
                        </p>
                      ) : (
                        occ.map((row) => {
                          if (row.kind === 'sunday') {
                            return <SundayWeekCard key={row.key} item={row} onOpen={openSunday} />;
                          }
                          const tone = EVENT_TONE_STYLES[eventToneIndex(row.occurrence.item.id)];
                          return (
                            <button
                              key={row.key}
                              type="button"
                              onClick={() => openOccurrence(row.occurrence)}
                              className={[
                                'tap-highlight-transparent w-full rounded-xl border px-3 py-3 text-left ring-1 transition sm:hover:-translate-y-0.5',
                                tone.weekCard,
                              ].join(' ')}
                            >
                              <p className={`flex items-center gap-1.5 text-[12px] font-extrabold ${tone.weekTime}`}>
                                <LuClock className="h-4 w-4 shrink-0" aria-hidden />
                                {format(row.startsAt, 'HH:mm')}
                              </p>
                              <p className="mt-1.5 line-clamp-3 text-[15px] font-extrabold leading-snug text-stone-900">
                                {(row.occurrence.item.title ?? '').trim() || 'Мероприятие'}
                              </p>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="hidden overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] [-webkit-overflow-scrolling:touch] lg:block">
              <div className="grid min-w-[720px] grid-cols-7 divide-x divide-stone-100">
                {weekDays.map((day) => {
                  const occ = itemsOnDay(day);
                  const today = isSameDay(day, new Date());
                  const sunday = day.getDay() === 0;
                  return (
                    <div key={day.toISOString()} className={`flex min-h-[280px] flex-col ${sunday ? 'bg-[#FBF7F8]/50' : 'bg-white'}`}>
                      <div
                        className={[
                          'border-b border-stone-100 px-2 py-2 text-center sm:px-3',
                          today ? 'bg-emerald-50/90' : sunday ? 'bg-[#F8EEF1]/80' : 'bg-stone-50/80',
                        ].join(' ')}
                      >
                        <p className={`text-[11px] font-extrabold uppercase tracking-wide ${sunday ? 'text-[#6B2D3E]' : 'text-stone-500'}`}>
                          {format(day, 'EEE', { locale: ru })}
                        </p>
                        <p className={`mt-1 text-lg font-extrabold ${today ? 'text-[#0F6636]' : 'text-stone-900'}`}>
                          {format(day, 'd MMM', { locale: ru })}
                        </p>
                      </div>
                      <div className="flex flex-1 flex-col gap-2 p-2">
                        {loading ? (
                          <p className="text-xs font-semibold text-stone-400">Загрузка…</p>
                        ) : occ.length === 0 ? (
                          <p className="text-xs font-semibold text-stone-400">Нет мероприятий</p>
                        ) : (
                          occ.map((row) => {
                            if (row.kind === 'sunday') {
                              return <SundayWeekCard key={row.key} item={row} onOpen={openSunday} compact />;
                            }
                            const tone = EVENT_TONE_STYLES[eventToneIndex(row.occurrence.item.id)];
                            return (
                              <button
                                key={row.key}
                                type="button"
                                onClick={() => openOccurrence(row.occurrence)}
                                className={[
                                  'tap-highlight-transparent rounded-xl border px-2.5 py-2 text-left ring-1 transition sm:hover:-translate-y-0.5 sm:hover:shadow-md',
                                  tone.weekCard,
                                ].join(' ')}
                              >
                                <p className={`flex items-center gap-1 text-[11px] font-extrabold ${tone.weekTime}`}>
                                  <LuClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                  {format(row.startsAt, 'HH:mm')}
                                </p>
                                <p className="mt-1 line-clamp-3 text-sm font-extrabold text-stone-900">
                                  {(row.occurrence.item.title ?? '').trim() || 'Мероприятие'}
                                </p>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {mode === 'day' ? (
          <section className="rounded-2xl border border-stone-200/80 bg-white p-3 shadow-[var(--shadow-card)] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-4">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">Выбранный день</p>
                <p className="mt-1 text-[17px] font-extrabold leading-snug text-stone-900 sm:text-xl">
                  {capitalizeRuMonthTitle(format(dayOnly, 'EEEE, d MMMM yyyy', { locale: ru }))}
                </p>
              </div>
              {isToday(dayOnly) ? (
                <span className="shrink-0 rounded-full bg-[#1A9A55] px-3 py-1.5 text-[11px] font-extrabold text-white">
                  Сегодня
                </span>
              ) : null}
            </div>
            <div className="mt-4 space-y-3">
              {loading ? (
                <p className="text-sm font-semibold text-stone-500">Загрузка мероприятий…</p>
              ) : (
                (() => {
                  const occ = itemsOnDay(dayOnly);
                  if (occ.length === 0) {
                    return (
                      <p className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-10 text-center text-sm font-semibold leading-relaxed text-stone-500">
                        На этот день мероприятий нет.
                      </p>
                    );
                  }
                  return occ.map((row) => {
                    if (row.kind === 'sunday') {
                      const service = row.service;
                      const subtitle = sundayServiceSubtitle(service);
                      return (
                        <button
                          key={row.key}
                          type="button"
                          onClick={() => openSunday(service)}
                          className={[
                            'tap-highlight-transparent flex w-full gap-3 rounded-2xl border p-3 text-left shadow-sm ring-1 transition sm:gap-5 sm:p-4 sm:hover:-translate-y-0.5 sm:hover:shadow-md',
                            SUNDAY_TONE.dayCard,
                          ].join(' ')}
                        >
                          <div
                            className={`flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center rounded-2xl text-white shadow-inner sm:h-16 sm:w-16 ${SUNDAY_TONE.dayStripe}`}
                          >
                            <span className="text-[10px] font-bold opacity-90">Время</span>
                            <span className="text-[17px] font-extrabold leading-none sm:text-lg">
                              {format(row.startsAt, 'HH:mm')}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 py-0.5">
                            <p className="text-[17px] font-extrabold leading-snug text-stone-900 sm:text-lg">
                              {service.title}
                            </p>
                            {subtitle ? (
                              <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-[#6B2D3E]">
                                {subtitle}
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${SUNDAY_TONE.pill}`}>
                                Воскресенье
                              </span>
                              {service.leader?.name ? (
                                <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700 ring-1 ring-stone-200/90">
                                  Ведущий: {service.leader.name}
                                </span>
                              ) : null}
                              {service.songs.length > 0 ? (
                                <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700 ring-1 ring-stone-200/90">
                                  {service.songs.length} песен
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    }
                    const o = row.occurrence;
                    const tone = EVENT_TONE_STYLES[eventToneIndex(o.item.id)];
                    return (
                      <button
                        key={row.key}
                        type="button"
                        onClick={() => openOccurrence(o)}
                        className={[
                          'tap-highlight-transparent flex w-full gap-3 rounded-2xl border p-3 text-left shadow-sm ring-1 transition sm:gap-5 sm:p-4 sm:hover:-translate-y-0.5 sm:hover:shadow-md',
                          tone.dayCard,
                        ].join(' ')}
                      >
                        <div
                          className={`flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center rounded-2xl text-white shadow-inner sm:h-16 sm:w-16 ${tone.dayStripe}`}
                        >
                          <span className="text-[10px] font-bold opacity-90">Время</span>
                          <span className="text-[17px] font-extrabold leading-none sm:text-lg">{format(o.startsAt, 'HH:mm')}</span>
                        </div>
                        <div className="min-w-0 flex-1 py-0.5">
                          <p className="text-[17px] font-extrabold leading-snug text-stone-900 sm:text-lg">
                            {(o.item.title ?? '').trim() || 'Мероприятие'}
                          </p>
                          <p className="mt-1 line-clamp-3 text-[13px] font-medium leading-snug text-stone-600 sm:line-clamp-2 sm:text-sm">
                            {(o.item.description ?? '').trim() || 'Нажмите, чтобы открыть описание.'}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${tone.pill}`}>
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
                    );
                  });
                })()
              )}
            </div>
          </section>
        ) : null}

        {mode === 'agenda' ? (
          <section className="space-y-3">
            {loading ? (
              <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-center text-sm font-semibold text-stone-500">
                Загрузка мероприятий…
              </p>
            ) : (
              (() => {
                const daysWithItems = agendaDays
                  .map((day) => ({ day, items: itemsOnDay(day) }))
                  .filter((row) => row.items.length > 0);
                if (daysWithItems.length === 0) {
                  return (
                    <p className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-10 text-center text-sm font-semibold text-stone-500">
                      В этом месяце мероприятий нет.
                    </p>
                  );
                }
                return daysWithItems.map(({ day, items: dayItems }) => (
                  <article
                    key={day.toISOString()}
                    className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]"
                  >
                    <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                      <div>
                        <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                          {format(day, 'EEEE', { locale: ru })}
                        </p>
                        <p className="text-base font-extrabold text-stone-900">{format(day, 'd MMMM', { locale: ru })}</p>
                      </div>
                      {isToday(day) ? (
                        <span className="rounded-full bg-[#1A9A55] px-2.5 py-1 text-[11px] font-extrabold text-white">
                          Сегодня
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-2 p-3">
                      {dayItems.map((row) => {
                        if (row.kind === 'sunday') {
                          return <SundayWeekCard key={row.key} item={row} onOpen={openSunday} />;
                        }
                        const tone = EVENT_TONE_STYLES[eventToneIndex(row.occurrence.item.id)];
                        return (
                          <button
                            key={row.key}
                            type="button"
                            onClick={() => openOccurrence(row.occurrence)}
                            className={[
                              'tap-highlight-transparent w-full rounded-xl border px-3 py-3 text-left ring-1',
                              tone.weekCard,
                            ].join(' ')}
                          >
                            <p className={`flex items-center gap-1.5 text-[12px] font-extrabold ${tone.weekTime}`}>
                              <LuClock className="h-4 w-4 shrink-0" aria-hidden />
                              {format(row.startsAt, 'HH:mm')}
                            </p>
                            <p className="mt-1 text-[15px] font-extrabold text-stone-900">
                              {(row.occurrence.item.title ?? '').trim() || 'Мероприятие'}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ));
              })()
            )}
          </section>
        ) : null}
      </div>

      {sundayDetail && typeof document !== 'undefined'
        ? createPortal(
            <SundayServiceDetailSheet service={sundayDetail} onClose={() => setSundayDetail(null)} />,
            document.body,
          )
        : null}

      {detail && typeof document !== 'undefined'
        ? createPortal(
            <EventDetailSheet
              occurrence={detail}
              onClose={() => setDetail(null)}
              isAdmin={isAdmin}
              existingOverride={detailExistingOverride}
            />,
            document.body,
          )
        : null}

      <CreateChurchEventModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: keys.events });
          void queryClient.invalidateQueries({ queryKey: keys.eventOccurrenceOverrides });
        }}
      />
    </div>
  );
}
