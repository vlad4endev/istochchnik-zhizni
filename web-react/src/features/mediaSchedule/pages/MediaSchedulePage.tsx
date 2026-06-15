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
  isSameMonth,
  isSunday,
  isToday,
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
} from 'react-icons/lu';

import { AppAvatar } from '../../../components/AppAvatar';
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
  canManageMediaRoles,
  canManageMediaSchedule,
} from '../mediaAccess';
import type { MediaEvent, MediaScheduleViewMode } from '../types';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function ymd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function MediaSchedulePage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((s) => s.role);
  const rolesAuth = useAuthStore((s) => s.roles);
  const memberId = useAuthStore((s) => s.memberId);
  const meQ = useMe();
  const canManage = canManageMediaSchedule(role, meQ.data?.ministry_direction, rolesAuth);
  const canEditRoles = canManageMediaRoles(role, rolesAuth);

  const [viewMode, setViewMode] = useState<MediaScheduleViewMode>('month');
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

  const rangeFrom = viewMode === 'month' ? gridStart : weekStart;
  const rangeTo = viewMode === 'month' ? gridEnd : weekEnd;

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
    queryFn: fetchMediaMembers,
  });

  const events = eventsQ.data ?? [];
  const roles = rolesQ.data ?? [];
  const members = membersQ.data ?? [];

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

  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  );

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
      ? format(cursor, 'LLLL yyyy', { locale: ru })
      : `${format(weekStart, 'd', { locale: ru })}–${format(weekEnd, 'd MMMM', { locale: ru })}`;

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
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)] sm:text-2xl">Расписание медиа-служения</h1>
          <p className="text-sm text-[var(--text-muted)]">Службы, репетиции и назначения команды</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={[
                'rounded-lg px-3 py-1.5 text-sm font-semibold',
                viewMode === 'month' ? 'bg-primary text-white' : 'text-[var(--text-muted)]',
              ].join(' ')}
            >
              Месяц
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={[
                'rounded-lg px-3 py-1.5 text-sm font-semibold',
                viewMode === 'week' ? 'bg-primary text-white' : 'text-[var(--text-muted)]',
              ].join(' ')}
            >
              Неделя
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm font-semibold"
          >
            Сегодня
          </button>
          <Link
            to="/media-schedule/my"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm font-semibold"
          >
            <LuClock className="h-4 w-4" /> Моё расписание
          </Link>
          {canManage ? (
            <>
              <button
                type="button"
                onClick={openPlannerPicker}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-white"
              >
                <LuPlus className="h-4 w-4" /> Назначение
              </button>
              {canEditRoles ? (
                <button
                  type="button"
                  onClick={() => setRolesModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm font-semibold"
                >
                  <LuSettings className="h-4 w-4" /> Роли
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCursor((d) => (viewMode === 'month' ? addMonths(d, -1) : addWeeks(d, -1)))}
          className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)]"
          aria-label="Назад"
        >
          <LuChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-center text-base font-semibold capitalize">{headerLabel}</p>
        <button
          type="button"
          onClick={() => setCursor((d) => (viewMode === 'month' ? addMonths(d, 1) : addWeeks(d, 1)))}
          className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)]"
          aria-label="Вперёд"
        >
          <LuChevronRight className="h-5 w-5" />
        </button>
      </div>

      {eventsQ.isLoading ? (
        <div className="flex flex-1 items-center justify-center py-16 text-[var(--text-muted)]">
          <LuLoaderCircle className="h-8 w-8 animate-spin" />
        </div>
      ) : viewMode === 'month' ? (
        <div className="min-h-0 flex-1">
          <div className="mb-1 hidden grid-cols-7 gap-1 sm:grid">
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={label}
                className={[
                  'py-1 text-center text-xs font-semibold uppercase',
                  i === 6 ? 'text-primary' : 'text-[var(--text-muted)]',
                ].join(' ')}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day) => {
              const key = ymd(day);
              const dayEvents = eventsByDate.get(key) ?? [];
              const inMonth = isSameMonth(day, cursor);
              const today = isToday(day);
              const sunday = isSunday(day);
              return (
                <div
                  key={key}
                  className={[
                    'flex min-h-[72px] flex-col rounded-xl border p-1 sm:min-h-[110px] sm:p-2',
                    inMonth ? 'border-[var(--border)] bg-[var(--surface-elevated)]' : 'border-transparent bg-black/[0.02] opacity-60',
                    today ? 'ring-2 ring-primary/40' : '',
                    sunday ? 'bg-primary/[0.03]' : '',
                  ].join(' ')}
                >
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => setMobileDayPanel(key)}
                      className={[
                        'text-xs font-bold sm:text-sm',
                        today ? 'text-primary' : sunday ? 'text-primary/80' : 'text-[var(--text)]',
                      ].join(' ')}
                    >
                      {format(day, 'd')}
                    </button>
                    {canManage && inMonth ? (
                      <button
                        type="button"
                        onClick={() => openPlannerPicker()}
                        className="hidden h-6 w-6 place-items-center rounded-md text-primary hover:bg-primary/10 sm:grid"
                        aria-label="Добавить событие"
                      >
                        <LuPlus className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <div className="hidden min-h-0 flex-1 flex-col gap-1 overflow-hidden sm:flex">
                    {dayEvents.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => openAssignmentModal(ev.id)}
                        className="rounded-lg bg-[var(--surface)] px-1.5 py-1 text-left text-[11px] ring-1 ring-[var(--border)] hover:ring-primary/30"
                      >
                        <p className="truncate font-semibold">{ev.title}</p>
                        <div className="mt-0.5 flex -space-x-1">
                          {ev.assignments.slice(0, 4).map((a) => (
                            <span
                              key={a.id}
                              className="inline-block rounded-full ring-2 ring-white"
                              style={{ boxShadow: `0 0 0 1px ${a.role.color}` }}
                            >
                              <AppAvatar
                                src={a.member.avatar_url}
                                fallback={
                                  <span className="text-[8px] font-bold text-white">
                                    {a.member.name.slice(0, 1)}
                                  </span>
                                }
                                initialsFallbackText={a.member.name}
                                className="grid h-7 w-7 place-items-center overflow-hidden rounded-full"
                              />
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-0.5 sm:hidden">
                    {dayEvents.slice(0, 4).map((ev) => (
                      <span
                        key={ev.id}
                        className="h-1.5 w-1.5 rounded-full bg-primary"
                        title={ev.title}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-[720px] w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-2 text-left text-xs font-semibold">
                  Роль
                </th>
                {weekDays.flatMap((day) => {
                  const key = ymd(day);
                  const dayEvents = eventsByDate.get(key) ?? [];
                  if (dayEvents.length === 0) {
                    return (
                      <th
                        key={key}
                        className="min-w-[100px] border-b border-[var(--border)] px-2 py-2 text-center text-xs font-semibold"
                      >
                        {format(day, 'EEE d', { locale: ru })}
                      </th>
                    );
                  }
                  return dayEvents.map((ev) => (
                    <th
                      key={`${key}-${ev.id}`}
                      className="min-w-[110px] border-b border-[var(--border)] px-2 py-2 text-center text-xs font-semibold"
                    >
                      <div>{format(day, 'EEE d', { locale: ru })}</div>
                      <div className="truncate font-normal text-[var(--text-muted)]">{ev.title}</div>
                    </th>
                  ));
                })}
              </tr>
            </thead>
            <tbody>
              {roles.map((roleRow) => (
                <tr key={roleRow.id}>
                  <td className="sticky left-0 z-10 border-b border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: roleRow.color }} />
                      <span className="text-xs font-semibold">{roleRow.name}</span>
                    </div>
                  </td>
                  {weekDays.flatMap((day) => {
                    const key = ymd(day);
                    const dayEvents = eventsByDate.get(key) ?? [];
                    const cols = dayEvents.length > 0 ? dayEvents : [null];
                    return cols.map((ev) => {
                      const assignment =
                        ev?.assignments.find((a) => a.role_id === roleRow.id) ?? null;
                      const cellKey = ev ? `${key}-${ev.id}-${roleRow.id}` : `${key}-empty-${roleRow.id}`;
                      return (
                        <td key={cellKey} className="border-b border-[var(--border)] px-1 py-1 align-top">
                          {assignment ? (
                            <button
                              type="button"
                              onClick={() =>
                                setContextMenu({ assignmentId: assignment.id, eventId: ev!.id })
                              }
                              className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium ring-2"
                              style={{
                                borderColor: assignmentStatusBorderColor(assignment.status),
                                boxShadow: `inset 0 0 0 1px ${assignmentStatusBorderColor(assignment.status)}`,
                              }}
                            >
                              {assignment.member.name}
                            </button>
                          ) : canManage && ev ? (
                            <button
                              type="button"
                              onClick={() => setAssignModal({ event: ev, roleId: roleRow.id })}
                              className="grid h-9 w-full place-items-center rounded-lg border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-primary hover:text-primary"
                            >
                              <LuPlus className="h-4 w-4" />
                            </button>
                          ) : (
                            <span className="block py-2 text-center text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                      );
                    });
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mobileDayPanel ? (
        <div className="fixed inset-0 z-[70] sm:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileDayPanel(null)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-[var(--surface-elevated)] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">
                {format(new Date(`${mobileDayPanel}T12:00:00`), 'd MMMM', { locale: ru })}
              </h3>
              <button type="button" onClick={() => setMobileDayPanel(null)}>
                Закрыть
              </button>
            </div>
            <ul className="space-y-2">
              {(eventsByDate.get(mobileDayPanel) ?? []).map((ev) => (
                <li key={ev.id}>
                  <button
                    type="button"
                    onClick={() => {
                      openAssignmentModal(ev.id);
                      setMobileDayPanel(null);
                    }}
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-left"
                  >
                    <p className="font-semibold">{ev.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {ev.assignments.length} назначений
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            {canManage ? (
              <button
                type="button"
                onClick={() => {
                  openPlannerPicker();
                  setMobileDayPanel(null);
                }}
                className="mt-3 w-full rounded-xl bg-primary py-2 text-sm font-semibold text-white"
              >
                + Событие
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {contextMenu && canManage ? (
        <div className="fixed inset-0 z-[72]" onClick={() => setContextMenu(null)} role="presentation">
          <div
            className="absolute left-1/2 top-1/2 w-[min(90vw,280px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-2 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5"
              onClick={() => {
                const ev = events.find((e) => e.id === contextMenu.eventId);
                if (ev) openAssignmentModal(ev.id);
                setContextMenu(null);
              }}
            >
              Изменить событие
            </button>
            <button
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
              onClick={() => {
                void removeMut.mutateAsync(contextMenu.assignmentId);
                setContextMenu(null);
              }}
            >
              Убрать назначение
            </button>
          </div>
        </div>
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
  );
}
