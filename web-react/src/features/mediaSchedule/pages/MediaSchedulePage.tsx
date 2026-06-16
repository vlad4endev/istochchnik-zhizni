import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isSunday,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  LuChevronLeft,
  LuChevronRight,
  LuClock,
  LuLoaderCircle,
  LuPlus,
  LuSettings,
  LuUsers,
  LuX,
} from 'react-icons/lu';

import { AppAvatar } from '../../../components/AppAvatar';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useAuthStore } from '../../auth/authStore';
import { useMe } from '../../../hooks/useMe';
import {
  assignMediaMember,
  createMediaRole,
  deleteMediaRole,
  fetchMediaEvents,
  fetchMediaMembers,
  fetchMediaRoles,
  removeMediaAssignment,
  reorderMediaRoles,
  updateMediaRole,
} from '../api';
import { EventModal } from '../components/EventModal';
import { MemberPickerModal } from '../components/MemberPickerModal';
import { PlannerEventPickerModal } from '../components/PlannerEventPickerModal';
import { RolesSettingsModal } from '../components/RolesSettingsModal';
import {
  assignmentStatusBorderColor,
  assignmentStatusLabel,
  canManageMediaRoles,
  canManageMediaSchedule,
} from '../mediaAccess';
import { MinistryScheduleSwitcher } from '../../schedules/components/MinistryScheduleSwitcher';
import type { MediaEvent, MediaScheduleViewMode } from '../types';
import {
  buildNavigableWeekStarts,
  buildWeekEventColumns,
  findNavigableWeekIndex,
  formatWeekViewHeader,
  getWeekDaysWithEvents,
  snapCursorToNearestServiceWeek,
  weekHasEvents,
} from '../utils/mediaScheduleWeekView';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const EVENT_TONE_STYLES = [
  {
    chip: 'bg-rose-50 ring-rose-200/90 hover:bg-rose-100',
    time: 'text-rose-700',
    title: 'text-rose-950',
    stripe: 'bg-rose-500',
    weekCard: 'border-rose-100 bg-gradient-to-br from-rose-50/80 to-white ring-rose-100/70',
  },
  {
    chip: 'bg-violet-50 ring-violet-200/90 hover:bg-violet-100',
    time: 'text-violet-700',
    title: 'text-violet-950',
    stripe: 'bg-violet-500',
    weekCard: 'border-violet-100 bg-gradient-to-br from-violet-50/80 to-white ring-violet-100/70',
  },
  {
    chip: 'bg-teal-50 ring-teal-200/90 hover:bg-teal-100',
    time: 'text-teal-700',
    title: 'text-teal-950',
    stripe: 'bg-teal-500',
    weekCard: 'border-teal-100 bg-gradient-to-br from-teal-50/80 to-white ring-teal-100/70',
  },
  {
    chip: 'bg-amber-50 ring-amber-200/90 hover:bg-amber-100',
    time: 'text-amber-800',
    title: 'text-amber-950',
    stripe: 'bg-amber-500',
    weekCard: 'border-amber-100 bg-gradient-to-br from-amber-50/80 to-white ring-amber-100/70',
  },
  {
    chip: 'bg-indigo-50 ring-indigo-200/90 hover:bg-indigo-100',
    time: 'text-indigo-700',
    title: 'text-indigo-950',
    stripe: 'bg-indigo-500',
    weekCard: 'border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white ring-indigo-100/70',
  },
] as const;

function ymd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function eventToneIndex(eventId: number): number {
  const n = EVENT_TONE_STYLES.length;
  return ((eventId % n) + n) % n;
}

function capitalizeRuMonthTitle(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function assignmentCoverage(ev: MediaEvent, totalRoles: number): { filled: number; total: number } {
  const roleIds = new Set(ev.assignments.map((a) => a.role_id));
  return { filled: roleIds.size, total: totalRoles };
}

function mobileSheetFooterClass(): string {
  return 'border-t border-stone-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]';
}

export function MediaSchedulePage() {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((s) => s.role);
  const rolesAuth = useAuthStore((s) => s.roles);
  const memberId = useAuthStore((s) => s.memberId);
  const meQ = useMe();
  const canManage = canManageMediaSchedule(role, meQ.data?.ministry_role, rolesAuth);
  const canEditRoles = canManageMediaRoles(role, rolesAuth);

  const [viewMode, setViewMode] = useState<MediaScheduleViewMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches ? 'week' : 'month',
  );
  const [cursor, setCursor] = useState(() => new Date());
  const [assignmentPlanId, setAssignmentPlanId] = useState<number | null>(null);
  const [plannerPickerOpen, setPlannerPickerOpen] = useState(false);
  const [rolesModalOpen, setRolesModalOpen] = useState(false);
  const [assignModal, setAssignModal] = useState<{
    event: MediaEvent;
    roleId: number;
  } | null>(null);
  const [mobileDayPanel, setMobileDayPanel] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    assignmentId: number;
    eventId: number;
  } | null>(null);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(cursor, { weekStartsOn: 1 });

  const rangeFrom = viewMode === 'month' ? gridStart : startOfWeek(addMonths(cursor, -6), { weekStartsOn: 1 });
  const rangeTo = viewMode === 'month' ? gridEnd : endOfWeek(addMonths(cursor, 6), { weekStartsOn: 1 });

  const eventsQ = useQuery({
    queryKey: ['media-schedule', 'events', ymd(rangeFrom), ymd(rangeTo)],
    queryFn: () => fetchMediaEvents(rangeFrom, rangeTo),
  });

  const rolesQ = useQuery({
    queryKey: ['media-schedule', 'roles'],
    queryFn: fetchMediaRoles,
  });

  const membersQ = useQuery({
    queryKey: ['media-schedule', 'members'],
    queryFn: () => fetchMediaMembers(),
  });

  const events = eventsQ.data ?? [];
  const roles = rolesQ.data ?? [];
  const members = membersQ.data ?? [];
  const activeRoles = roles.filter((r) => r.is_active);

  useEffect(() => {
    const raw = searchParams.get('planId');
    if (!raw || !/^\d+$/.test(raw)) return;
    const id = Number(raw);
    if (id > 0) setAssignmentPlanId(id);
  }, [searchParams]);

  function openAssignmentModal(planId: number) {
    setAssignmentPlanId(planId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('planId', String(planId));
      return next;
    });
  }

  function closeAssignmentModal() {
    setAssignmentPlanId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('planId');
      return next;
    });
  }

  const eventsByDate = useMemo(() => {
    const map = new Map<string, MediaEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.event_date) ?? [];
      list.push(ev);
      map.set(ev.event_date, list);
    }
    return map;
  }, [events]);

  const monthDays = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd],
  );

  const navigableWeekStarts = useMemo(() => buildNavigableWeekStarts(events), [events]);

  const weekDaysWithEvents = useMemo(
    () => getWeekDaysWithEvents(events, weekStart, weekEnd),
    [events, weekStart, weekEnd],
  );

  const weekEventColumns = useMemo(
    () => buildWeekEventColumns(eventsByDate, weekDaysWithEvents),
    [eventsByDate, weekDaysWithEvents],
  );

  const navigableWeekIndex = useMemo(
    () => findNavigableWeekIndex(navigableWeekStarts, cursor),
    [navigableWeekStarts, cursor],
  );

  useEffect(() => {
    if (viewMode !== 'week' || eventsQ.isLoading || events.length === 0) return;
    if (weekHasEvents(events, weekStart, weekEnd)) return;
    const snapped = snapCursorToNearestServiceWeek(cursor, navigableWeekStarts);
    if (format(snapped, 'yyyy-MM-dd') !== format(weekStart, 'yyyy-MM-dd')) {
      setCursor(snapped);
    }
  }, [viewMode, eventsQ.isLoading, events, weekStart, weekEnd, cursor, navigableWeekStarts]);

  const upcomingCount = useMemo(() => {
    const today = ymd(new Date());
    return events.filter((e) => e.event_date >= today).length;
  }, [events]);

  const monthAgendaEvents = useMemo(() => {
    const monthKey = format(cursor, 'yyyy-MM');
    return events
      .filter((e) => e.event_date.startsWith(monthKey))
      .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''));
  }, [events, cursor]);

  useEffect(() => {
    if (!mobileDayPanel && !contextMenu) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileDayPanel, contextMenu]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['media-schedule'] });
  };

  const assignMut = useMutation({
    mutationFn: async ({ eventId, memberId: mid, roleId }: { eventId: number; memberId: number; roleId: number }) => {
      await assignMediaMember(eventId, mid, roleId);
    },
    onSuccess: invalidate,
  });

  const removeMut = useMutation({
    mutationFn: removeMediaAssignment,
    onSuccess: invalidate,
  });

  const headerLabel =
    viewMode === 'month'
      ? capitalizeRuMonthTitle(format(cursor, 'LLLL yyyy', { locale: ru }))
      : formatWeekViewHeader(weekDaysWithEvents, weekStart, weekEnd);

  function goWeekPrev() {
    if (navigableWeekStarts.length === 0) {
      setCursor((d) => addWeeks(d, -1));
      return;
    }
    if (navigableWeekIndex > 0) {
      setCursor(navigableWeekStarts[navigableWeekIndex - 1]!);
      return;
    }
    setCursor(navigableWeekStarts[0]!);
  }

  function goWeekNext() {
    if (navigableWeekStarts.length === 0) {
      setCursor((d) => addWeeks(d, 1));
      return;
    }
    if (navigableWeekIndex >= 0 && navigableWeekIndex < navigableWeekStarts.length - 1) {
      setCursor(navigableWeekStarts[navigableWeekIndex + 1]!);
      return;
    }
    setCursor(navigableWeekStarts[navigableWeekStarts.length - 1]!);
  }

  function goWeekToday() {
    const today = new Date();
    if (navigableWeekStarts.length === 0) {
      setCursor(today);
      return;
    }
    setCursor(snapCursorToNearestServiceWeek(today, navigableWeekStarts));
  }

  function openPlannerPicker() {
    setPlannerPickerOpen(true);
  }

  function busyIdsForDate(dateStr: string, excludePlanId?: number): number[] {
    const ids = new Set<number>();
    for (const ev of events) {
      if (ev.event_date !== dateStr) continue;
      if (excludePlanId != null && ev.id === excludePlanId) continue;
      for (const a of ev.assignments) ids.add(a.member_id);
    }
    return Array.from(ids);
  }

  return (
    <div className="min-h-full bg-[var(--surface)] px-3 pb-28 pt-3 sm:px-4 sm:pb-12 sm:pt-4 shell:px-6 md:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-3 sm:space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-primary">
              <LuUsers className="h-3.5 w-3.5" aria-hidden />
              Медиа-команда
            </div>
            <h1 className="mt-2 text-xl font-extrabold tracking-tight text-stone-900 sm:text-2xl">
              Расписание
            </h1>
            <p className="mt-1 text-[13px] font-semibold leading-snug text-stone-500 sm:text-sm">
              Медиа-служение — службы и назначения команды
              {upcomingCount > 0 ? (
                <span className="ml-1.5 text-primary">· {upcomingCount} впереди</span>
              ) : null}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <Link
              to="/schedules/media/my"
              className="tap-highlight-transparent col-span-2 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-extrabold text-stone-700 shadow-sm hover:bg-stone-50 active:bg-stone-100 sm:col-span-1 sm:w-auto"
            >
              <LuClock className="h-4 w-4 shrink-0" aria-hidden />
              Моё расписание
            </Link>
            {canManage ? (
              <>
                <button
                  type="button"
                  onClick={openPlannerPicker}
                  className="tap-highlight-transparent hidden min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-white shadow-sm hover:brightness-110 active:brightness-95 sm:inline-flex sm:w-auto"
                >
                  <LuPlus className="h-4 w-4 shrink-0" aria-hidden />
                  Назначение
                </button>
                {canEditRoles ? (
                  <button
                    type="button"
                    onClick={() => setRolesModalOpen(true)}
                    className="tap-highlight-transparent inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-extrabold text-stone-700 shadow-sm hover:bg-stone-50 active:bg-stone-100 sm:w-auto"
                  >
                    <LuSettings className="h-4 w-4 shrink-0" aria-hidden />
                    Роли
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </header>

        <MinistryScheduleSwitcher
          role={role}
          ministryDirection={meQ.data?.ministry_direction}
          ministryRole={meQ.data?.ministry_role}
          roles={rolesAuth}
          active="media"
        />

        <div className="flex flex-col gap-3 rounded-2xl border border-stone-200/80 bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
          <div
            className="flex w-full rounded-2xl border border-stone-200 bg-stone-100/90 p-1"
            role="tablist"
            aria-label="Масштаб расписания"
          >
            {(
              [
                ['month', 'Месяц'],
                ['week', 'Неделя'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={viewMode === id}
                onClick={() => {
                  setViewMode(id);
                  if (id === 'week' && events.length > 0) {
                    const starts = buildNavigableWeekStarts(events);
                    setCursor((current) => snapCursorToNearestServiceWeek(current, starts));
                  }
                }}
                className={[
                  'tap-highlight-transparent min-h-[44px] flex-1 rounded-[10px] px-2 text-[13px] font-extrabold transition-colors sm:min-h-[40px] sm:px-3 sm:text-sm',
                  viewMode === id
                    ? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-200/90'
                    : 'text-stone-600 hover:text-stone-900',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-center text-[15px] font-extrabold leading-snug text-stone-900 sm:flex-1 sm:text-left sm:text-base">
              {headerLabel}
            </p>
            <div className="flex items-center justify-center gap-1.5 sm:shrink-0">
              <button
                type="button"
                onClick={() => (viewMode === 'month' ? setCursor((d) => addMonths(d, -1)) : goWeekPrev())}
                disabled={viewMode === 'week' && navigableWeekStarts.length > 0 && navigableWeekIndex <= 0}
                className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50 active:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Назад"
              >
                <LuChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => (viewMode === 'month' ? setCursor(new Date()) : goWeekToday())}
                className="tap-highlight-transparent min-h-[44px] flex-1 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 px-4 text-sm font-extrabold text-primary hover:brightness-[1.02] active:brightness-[0.98] sm:flex-initial sm:px-3"
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={() => (viewMode === 'month' ? setCursor((d) => addMonths(d, 1)) : goWeekNext())}
                disabled={
                  viewMode === 'week' &&
                  navigableWeekStarts.length > 0 &&
                  navigableWeekIndex >= navigableWeekStarts.length - 1
                }
                className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50 active:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Вперёд"
              >
                <LuChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        {eventsQ.isLoading ? (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-stone-200/80 bg-white py-20 shadow-[var(--shadow-card)]">
            <LuLoaderCircle className="h-8 w-8 animate-spin text-stone-400" />
          </div>
        ) : viewMode === 'month' ? (
          <>
            <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
              <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50/90">
                {WEEKDAY_LABELS.map((label, i) => (
                  <div
                    key={label}
                    className={[
                      'px-0.5 py-2 text-center text-[10px] font-extrabold uppercase tracking-wide sm:px-1 sm:text-xs',
                      i === 6 ? 'text-primary' : 'text-stone-500',
                    ].join(' ')}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Мобильный компактный календарь — без горизонтального скролла */}
              <div className="grid grid-cols-7 gap-px bg-stone-100 lg:hidden">
                {monthDays.map((day) => {
                  const key = ymd(day);
                  const dayEvents = eventsByDate.get(key) ?? [];
                  const inMonth = isSameMonth(day, cursor);
                  const today = isToday(day);
                  const sunday = isSunday(day);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMobileDayPanel(key)}
                      className={[
                        'tap-highlight-transparent touch-manipulation flex min-h-[52px] flex-col items-center justify-start gap-0.5 bg-white p-1 active:bg-stone-50',
                        !inMonth ? 'opacity-35' : '',
                        today ? 'ring-1 ring-inset ring-primary/40 bg-primary/[0.03]' : '',
                        sunday && inMonth && !today ? 'bg-primary/[0.02]' : '',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold',
                          today ? 'bg-primary text-white' : sunday ? 'text-primary' : 'text-stone-800',
                        ].join(' ')}
                      >
                        {format(day, 'd')}
                      </span>
                      <div className="flex min-h-[6px] flex-wrap items-center justify-center gap-0.5">
                        {dayEvents.slice(0, 3).map((ev) => {
                          const tone = EVENT_TONE_STYLES[eventToneIndex(ev.id)];
                          return (
                            <span
                              key={ev.id}
                              className={['h-1.5 w-1.5 rounded-full', tone.stripe].join(' ')}
                            />
                          );
                        })}
                        {dayEvents.length > 3 ? (
                          <span className="text-[8px] font-bold leading-none text-stone-400">+</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Десктоп: полная сетка с карточками событий */}
              <div className="hidden grid-cols-7 gap-px bg-stone-100 lg:grid">
                {monthDays.map((day) => {
                  const key = ymd(day);
                  const dayEvents = eventsByDate.get(key) ?? [];
                  const inMonth = isSameMonth(day, cursor);
                  const today = isToday(day);
                  const sunday = isSunday(day);
                  const visible = dayEvents.slice(0, 2);
                  const more = dayEvents.length - visible.length;

                  return (
                    <div
                      key={key}
                      className={[
                        'group relative flex min-h-[128px] flex-col bg-white p-2',
                        !inMonth ? 'opacity-40' : '',
                        today ? 'ring-1 ring-inset ring-primary/35' : '',
                        sunday && inMonth ? 'bg-primary/[0.02]' : '',
                      ].join(' ')}
                    >
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <span
                          className={[
                            'flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold',
                            today ? 'bg-primary text-white' : sunday ? 'text-primary' : 'text-stone-800',
                          ].join(' ')}
                        >
                          {format(day, 'd')}
                        </span>
                        {canManage && inMonth ? (
                          <button
                            type="button"
                            onClick={() => openPlannerPicker()}
                            className="grid h-7 w-7 place-items-center rounded-lg text-stone-400 opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
                            aria-label="Добавить событие"
                          >
                            <LuPlus className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                        {visible.map((ev) => {
                          const tone = EVENT_TONE_STYLES[eventToneIndex(ev.id)];
                          const coverage = assignmentCoverage(ev, activeRoles.length);
                          const allFilled = coverage.total > 0 && coverage.filled >= coverage.total;
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => openAssignmentModal(ev.id)}
                              className={[
                                'tap-highlight-transparent w-full rounded-lg px-1.5 py-1 text-left ring-1 transition-all hover:shadow-sm active:scale-[0.99]',
                                tone.chip,
                              ].join(' ')}
                            >
                              <p className="truncate text-[11px] font-extrabold leading-tight">
                                {ev.start_time ? (
                                  <span className={tone.time}>{ev.start_time} </span>
                                ) : null}
                                <span className={tone.title}>{ev.title}</span>
                              </p>
                              <div className="mt-1 flex items-center justify-between gap-1">
                                <div className="flex -space-x-1.5">
                                  {ev.assignments.slice(0, 3).map((a) => (
                                    <span
                                      key={a.id}
                                      className="inline-block rounded-full ring-2 ring-white"
                                      title={`${a.member.name} · ${a.role.name}`}
                                    >
                                      <AppAvatar
                                        src={a.member.avatar_url}
                                        fallback={
                                          <span className="text-[7px] font-bold text-white">
                                            {a.member.name.slice(0, 1)}
                                          </span>
                                        }
                                        initialsFallbackText={a.member.name}
                                        className="grid h-6 w-6 place-items-center overflow-hidden rounded-full"
                                      />
                                    </span>
                                  ))}
                                  {ev.assignments.length > 3 ? (
                                    <span className="grid h-6 w-6 place-items-center rounded-full bg-stone-200 text-[8px] font-bold text-stone-600 ring-2 ring-white">
                                      +{ev.assignments.length - 3}
                                    </span>
                                  ) : null}
                                </div>
                                {activeRoles.length > 0 ? (
                                  <span
                                    className={[
                                      'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold',
                                      allFilled
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-stone-100 text-stone-600',
                                    ].join(' ')}
                                  >
                                    {coverage.filled}/{coverage.total}
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                        {more > 0 ? (
                          <button
                            type="button"
                            onClick={() => openAssignmentModal(dayEvents[2]!.id)}
                            className="text-left text-[10px] font-bold text-stone-500 hover:text-primary"
                          >
                            +ещё {more}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Мобильный список служений за месяц */}
            <section className="space-y-2 lg:hidden">
              <h2 className="px-1 text-sm font-extrabold text-stone-800">
                Служения — {capitalizeRuMonthTitle(format(cursor, 'LLLL', { locale: ru }))}
              </h2>
              {monthAgendaEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-10 text-center shadow-[var(--shadow-card)]">
                  <p className="text-sm font-extrabold text-stone-700">Нет служений в этом месяце</p>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={openPlannerPicker}
                      className="tap-highlight-transparent mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-white"
                    >
                      <LuPlus className="h-4 w-4" />
                      Добавить
                    </button>
                  ) : null}
                </div>
              ) : (
                <ul className="space-y-2">
                  {monthAgendaEvents.map((ev) => {
                    const tone = EVENT_TONE_STYLES[eventToneIndex(ev.id)];
                    const coverage = assignmentCoverage(ev, activeRoles.length);
                    const evDate = parseISO(ev.event_date);
                    return (
                      <li key={ev.id}>
                        <button
                          type="button"
                          onClick={() => openAssignmentModal(ev.id)}
                          className={[
                            'tap-highlight-transparent flex w-full items-start gap-3 rounded-2xl border p-3 text-left shadow-sm active:scale-[0.99]',
                            tone.weekCard,
                          ].join(' ')}
                        >
                          <span className={['mt-1 h-10 w-1 shrink-0 rounded-full', tone.stripe].join(' ')} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                              {format(evDate, 'EEEE, d MMMM', { locale: ru })}
                            </p>
                            <p className="mt-0.5 font-extrabold text-stone-900">{ev.title}</p>
                            {ev.start_time ? (
                              <p className="mt-0.5 text-xs font-semibold text-stone-500">{ev.start_time}</p>
                            ) : null}
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex -space-x-1.5">
                                {ev.assignments.slice(0, 4).map((a) => (
                                  <AppAvatar
                                    key={a.id}
                                    src={a.member.avatar_url}
                                    fallback={
                                      <span className="text-[8px] font-bold text-white">
                                        {a.member.name.slice(0, 1)}
                                      </span>
                                    }
                                    initialsFallbackText={a.member.name}
                                    className="grid h-7 w-7 place-items-center overflow-hidden rounded-full ring-2 ring-white"
                                  />
                                ))}
                              </div>
                              {activeRoles.length > 0 ? (
                                <span className="text-[11px] font-bold text-stone-500">
                                  {coverage.filled}/{coverage.total}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <>
            {weekDaysWithEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-14 text-center shadow-[var(--shadow-card)]">
                <p className="text-sm font-extrabold text-stone-700">Нет служений в выбранном периоде</p>
                <p className="mt-1 text-xs font-semibold text-stone-500">
                  Переключите неделю или добавьте программу из планировщика
                </p>
                {canManage ? (
                  <button
                    type="button"
                    onClick={openPlannerPicker}
                    className="tap-highlight-transparent mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-white"
                  >
                    <LuPlus className="h-4 w-4" />
                    Добавить служение
                  </button>
                ) : null}
              </div>
            ) : (
              <>
            <section className="space-y-3 lg:hidden">
              {weekDaysWithEvents.map((day) => {
                const key = ymd(day);
                const dayEvents = eventsByDate.get(key) ?? [];
                const today = isSameDay(day, new Date());
                return (
                  <div
                    key={key}
                    className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
                      <div>
                        <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                          {format(day, 'EEEE', { locale: ru })}
                        </p>
                        <p className={`mt-0.5 text-lg font-extrabold ${today ? 'text-primary' : 'text-stone-900'}`}>
                          {format(day, 'd MMMM', { locale: ru })}
                        </p>
                      </div>
                      {today ? (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-extrabold text-primary">
                          Сегодня
                        </span>
                      ) : null}
                    </div>
                    <ul className="divide-y divide-stone-100">
                        {dayEvents.map((ev) => {
                          const tone = EVENT_TONE_STYLES[eventToneIndex(ev.id)];
                          const coverage = assignmentCoverage(ev, activeRoles.length);
                          return (
                            <li key={ev.id}>
                              <button
                                type="button"
                                onClick={() => openAssignmentModal(ev.id)}
                                className={[
                                  'tap-highlight-transparent flex w-full flex-col gap-3 px-4 py-3 text-left active:bg-stone-50',
                                ].join(' ')}
                              >
                                <div className="flex items-start gap-3">
                                  <span className={['mt-1 h-10 w-1 shrink-0 rounded-full', tone.stripe].join(' ')} />
                                  <div className="min-w-0 flex-1">
                                    <p className="font-extrabold text-stone-900">{ev.title}</p>
                                    {ev.start_time ? (
                                      <p className="mt-0.5 text-xs font-semibold text-stone-500">{ev.start_time}</p>
                                    ) : null}
                                    {activeRoles.length > 0 ? (
                                      <p className="mt-1 text-[11px] font-bold text-stone-500">
                                        Назначено {coverage.filled} из {coverage.total} ролей
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="space-y-2 pl-4">
                                  {activeRoles.map((roleRow) => {
                                    const assignment = ev.assignments.find((a) => a.role_id === roleRow.id);
                                    if (assignment) {
                                      return (
                                        <div
                                          key={roleRow.id}
                                          className="flex min-h-[48px] items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2"
                                        >
                                          <span
                                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                                            style={{ backgroundColor: roleRow.color }}
                                          />
                                          <AppAvatar
                                            src={assignment.member.avatar_url}
                                            fallback={
                                              <span className="text-[9px] font-bold text-white">
                                                {assignment.member.name.slice(0, 1)}
                                              </span>
                                            }
                                            initialsFallbackText={assignment.member.name}
                                            className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full"
                                          />
                                          <div className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-extrabold text-stone-900">
                                              {assignment.member.name}
                                            </span>
                                            <span className="text-[11px] font-semibold text-stone-500">{roleRow.name}</span>
                                          </div>
                                          {canManage ? (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setContextMenu({ assignmentId: assignment.id, eventId: ev.id });
                                              }}
                                              className="tap-highlight-transparent shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-stone-500"
                                            >
                                              ···
                                            </button>
                                          ) : null}
                                        </div>
                                      );
                                    }
                                    if (canManage) {
                                      return (
                                        <button
                                          key={roleRow.id}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setAssignModal({ event: ev, roleId: roleRow.id });
                                          }}
                                          className="tap-highlight-transparent flex min-h-[48px] w-full items-center gap-2.5 rounded-xl border border-dashed border-stone-200 bg-white px-3 py-2 text-left active:bg-primary/5"
                                        >
                                          <span
                                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                                            style={{ backgroundColor: roleRow.color }}
                                          />
                                          <span className="text-sm font-semibold text-stone-400">{roleRow.name}</span>
                                          <LuPlus className="ml-auto h-4 w-4 text-primary" />
                                        </button>
                                      );
                                    }
                                    return (
                                      <div
                                        key={roleRow.id}
                                        className="flex min-h-[44px] items-center gap-2 rounded-xl border border-dashed border-stone-100 px-3 py-2"
                                      >
                                        <span
                                          className="h-2 w-2 shrink-0 rounded-full opacity-50"
                                          style={{ backgroundColor: roleRow.color }}
                                        />
                                        <span className="text-xs font-semibold text-stone-300">{roleRow.name}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </button>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                );
              })}
            </section>

            <section className="hidden overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] lg:block">
              <div className="overflow-x-auto">
                <table className="min-w-[800px] w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-stone-50/90">
                      <th className="sticky left-0 z-10 border-b border-stone-100 bg-stone-50/95 px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                        Роль
                      </th>
                      {weekEventColumns.map(({ day, event: ev }) => {
                        const key = ymd(day);
                        const tone = EVENT_TONE_STYLES[eventToneIndex(ev.id)];
                        return (
                          <th
                            key={`${key}-${ev.id}`}
                            className="min-w-[120px] border-b border-stone-100 px-3 py-3 text-center"
                          >
                            <div className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                              {format(day, 'EEE d', { locale: ru })}
                            </div>
                            <div className={['mt-0.5 truncate text-xs font-extrabold', tone.title].join(' ')}>
                              {ev.title}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {activeRoles.map((roleRow) => (
                      <tr key={roleRow.id} className="group/row">
                        <td className="sticky left-0 z-10 border-b border-stone-100 bg-white px-4 py-2 group-hover/row:bg-stone-50/50">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="h-3 w-3 shrink-0 rounded-full shadow-sm"
                              style={{ backgroundColor: roleRow.color }}
                            />
                            <span className="text-xs font-extrabold text-stone-800">{roleRow.name}</span>
                          </div>
                        </td>
                        {weekEventColumns.map(({ day, event: ev }) => {
                          const key = ymd(day);
                          const assignment = ev.assignments.find((a) => a.role_id === roleRow.id) ?? null;
                          const cellKey = `${key}-${ev.id}-${roleRow.id}`;
                          const today = isToday(day);
                          return (
                            <td
                              key={cellKey}
                              className={[
                                'border-b border-stone-100 px-2 py-2 align-top',
                                today ? 'bg-primary/[0.02]' : '',
                              ].join(' ')}
                            >
                              {assignment ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setContextMenu({ assignmentId: assignment.id, eventId: ev.id })
                                  }
                                  className="flex w-full items-center gap-2 rounded-xl border bg-white px-2.5 py-2 text-left shadow-sm transition-all hover:shadow-md active:scale-[0.99]"
                                  style={{
                                    borderColor: assignmentStatusBorderColor(assignment.status),
                                  }}
                                >
                                  <AppAvatar
                                    src={assignment.member.avatar_url}
                                    fallback={
                                      <span className="text-[9px] font-bold text-white">
                                        {assignment.member.name.slice(0, 1)}
                                      </span>
                                    }
                                    initialsFallbackText={assignment.member.name}
                                    className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full"
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-extrabold text-stone-900">
                                      {assignment.member.name}
                                    </p>
                                    <p
                                      className="text-[10px] font-semibold"
                                      style={{ color: assignmentStatusBorderColor(assignment.status) }}
                                    >
                                      {assignmentStatusLabel(assignment.status)}
                                    </p>
                                  </div>
                                </button>
                              ) : canManage ? (
                                <button
                                  type="button"
                                  onClick={() => setAssignModal({ event: ev, roleId: roleRow.id })}
                                  className="grid h-11 w-full place-items-center rounded-xl border border-dashed border-stone-200 text-stone-400 transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                                  aria-label={`Назначить на ${roleRow.name}`}
                                >
                                  <LuPlus className="h-4 w-4" />
                                </button>
                              ) : (
                                <span className="block py-3 text-center text-stone-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-4 border-t border-stone-100 bg-stone-50/50 px-4 py-2.5 text-[11px] font-semibold text-stone-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[var(--btn-success-bg,#16a34a)]" />
                  Подтверждено
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Ожидает
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Отказ
                </span>
              </div>
            </section>
              </>
            )}
          </>
        )}

        {mobileDayPanel ? (
          <div className="fixed inset-0 z-[70] lg:hidden" role="presentation">
            <button
              type="button"
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setMobileDayPanel(null)}
            />
            <div
              className="absolute bottom-0 left-0 right-0 flex max-h-[min(82dvh,640px)] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
              style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
            >
              <div className="shrink-0 px-4 pt-3">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-200" />
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                      {format(new Date(`${mobileDayPanel}T12:00:00`), 'EEEE', { locale: ru })}
                    </p>
                    <h3 className="text-lg font-extrabold text-stone-900">
                      {format(new Date(`${mobileDayPanel}T12:00:00`), 'd MMMM', { locale: ru })}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileDayPanel(null)}
                    className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-full bg-stone-100 text-stone-600"
                    aria-label="Закрыть"
                  >
                    <LuX className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-2">
                {(eventsByDate.get(mobileDayPanel) ?? []).map((ev) => {
                  const tone = EVENT_TONE_STYLES[eventToneIndex(ev.id)];
                  const coverage = assignmentCoverage(ev, activeRoles.length);
                  return (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={() => {
                          openAssignmentModal(ev.id);
                          setMobileDayPanel(null);
                        }}
                        className={[
                          'tap-highlight-transparent flex w-full items-start gap-3 rounded-2xl border p-3 text-left shadow-sm active:scale-[0.99]',
                          tone.weekCard,
                        ].join(' ')}
                      >
                        <span className={['mt-1 h-10 w-1 shrink-0 rounded-full', tone.stripe].join(' ')} />
                        <div className="min-w-0 flex-1">
                          <p className="font-extrabold text-stone-900">{ev.title}</p>
                          {ev.start_time ? (
                            <p className="mt-0.5 text-xs font-semibold text-stone-500">{ev.start_time}</p>
                          ) : null}
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex -space-x-1.5">
                              {ev.assignments.slice(0, 5).map((a) => (
                                <AppAvatar
                                  key={a.id}
                                  src={a.member.avatar_url}
                                  fallback={
                                    <span className="text-[8px] font-bold text-white">
                                      {a.member.name.slice(0, 1)}
                                    </span>
                                  }
                                  initialsFallbackText={a.member.name}
                                  className="grid h-7 w-7 place-items-center overflow-hidden rounded-full ring-2 ring-white"
                                />
                              ))}
                            </div>
                            {activeRoles.length > 0 ? (
                              <span className="text-[11px] font-bold text-stone-500">
                                {coverage.filled}/{coverage.total} ролей
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {(eventsByDate.get(mobileDayPanel) ?? []).length === 0 ? (
                <p className="px-4 py-6 text-center text-sm font-semibold text-stone-400">Нет служений в этот день</p>
              ) : null}
              {canManage ? (
                <div className={mobileSheetFooterClass()}>
                  <button
                    type="button"
                    onClick={() => {
                      openPlannerPicker();
                      setMobileDayPanel(null);
                    }}
                    className="tap-highlight-transparent flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-extrabold text-white shadow-sm active:brightness-95"
                  >
                    <LuPlus className="h-4 w-4" />
                    Добавить служение
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {contextMenu && canManage ? (
          <>
            <div className="fixed inset-0 z-[72] lg:hidden" onClick={() => setContextMenu(null)} role="presentation">
              <button
                type="button"
                className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
                aria-label="Закрыть"
              />
              <div
                className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-3xl bg-white shadow-2xl"
                style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-stone-200" />
                <div className="border-b border-stone-100 px-4 py-3">
                  <p className="text-sm font-extrabold text-stone-900">Назначение</p>
                </div>
                <div className="p-2">
                  <button
                    type="button"
                    className="tap-highlight-transparent block w-full min-h-[48px] rounded-xl px-3 text-left text-sm font-semibold text-stone-800 active:bg-stone-50"
                    onClick={() => {
                      const ev = events.find((e) => e.id === contextMenu.eventId);
                      if (ev) openAssignmentModal(ev.id);
                      setContextMenu(null);
                    }}
                  >
                    Открыть событие
                  </button>
                  <button
                    type="button"
                    className="tap-highlight-transparent block w-full min-h-[48px] rounded-xl px-3 text-left text-sm font-semibold text-rose-600 active:bg-rose-50"
                    onClick={() => {
                      void removeMut.mutateAsync(contextMenu.assignmentId);
                      setContextMenu(null);
                    }}
                  >
                    Убрать назначение
                  </button>
                </div>
              </div>
            </div>
            <div className="fixed inset-0 z-[72] hidden lg:block" onClick={() => setContextMenu(null)} role="presentation">
              <div
                className="absolute left-1/2 top-1/2 w-[min(90vw,300px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-stone-100 px-4 py-3">
                  <p className="text-sm font-extrabold text-stone-900">Назначение</p>
                </div>
                <div className="p-2">
                  <button
                    type="button"
                    className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-stone-800 hover:bg-stone-50"
                    onClick={() => {
                      const ev = events.find((e) => e.id === contextMenu.eventId);
                      if (ev) openAssignmentModal(ev.id);
                      setContextMenu(null);
                    }}
                  >
                    Открыть событие
                  </button>
                  <button
                    type="button"
                    className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50"
                    onClick={() => {
                      void removeMut.mutateAsync(contextMenu.assignmentId);
                      setContextMenu(null);
                    }}
                  >
                    Убрать назначение
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {canManage && isMobile ? (
          <button
            type="button"
            onClick={openPlannerPicker}
            className="tap-highlight-transparent fixed bottom-[calc(var(--app-bottom-nav-total-height)+0.75rem)] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-white shadow-[0_4px_20px_rgba(125,54,64,0.45)] ring-4 ring-white active:scale-95 lg:hidden"
            aria-label="Добавить назначение"
          >
            <LuPlus className="h-6 w-6" />
          </button>
        ) : null}

        <PlannerEventPickerModal
          open={plannerPickerOpen}
          onClose={() => setPlannerPickerOpen(false)}
          from={rangeFrom}
          to={rangeTo}
          onSelect={(plan) => openAssignmentModal(plan.id)}
        />

        <EventModal
          open={assignmentPlanId != null}
          onClose={closeAssignmentModal}
          planId={assignmentPlanId}
          roles={roles}
          members={members}
          canManage={canManage}
          currentMemberId={memberId}
          allEvents={events}
          onSaved={invalidate}
        />

        <MemberPickerModal
          open={assignModal != null}
          onClose={() => setAssignModal(null)}
          members={members}
          roles={roles}
          preselectedRoleId={assignModal?.roleId}
          eventDate={assignModal?.event.event_date ?? ''}
          eventTitle={assignModal?.event.title ?? ''}
          busyMemberIdsOnDate={
            assignModal ? busyIdsForDate(assignModal.event.event_date, assignModal.event.id) : []
          }
          onAssign={async (mid, rid) => {
            if (!assignModal) return;
            await assignMut.mutateAsync({ eventId: assignModal.event.id, memberId: mid, roleId: rid });
            setAssignModal(null);
          }}
        />

        <RolesSettingsModal
          open={rolesModalOpen}
          onClose={() => setRolesModalOpen(false)}
          roles={roles}
          onCreate={async (input) => {
            await createMediaRole(input);
            invalidate();
          }}
          onUpdate={async (id, input) => {
            await updateMediaRole(id, input);
            invalidate();
          }}
          onDelete={async (id) => {
            await deleteMediaRole(id);
            invalidate();
          }}
          onReorder={async (ids) => {
            await reorderMediaRoles(ids);
            invalidate();
          }}
        />
      </div>
    </div>
  );
}
