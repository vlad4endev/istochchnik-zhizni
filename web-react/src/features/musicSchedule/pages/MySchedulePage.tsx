import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { addWeeks, format, isBefore, parseISO, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuArrowLeft, LuCalendarDays, LuCheck, LuLoaderCircle, LuX } from 'react-icons/lu';

import {
  apiErrorMessage,
  fetchMyMusicSchedule,
  updateMusicAssignmentStatus,
} from '../api';
import { assignmentStatusLabel } from '../musicAccess';
import type { MusicAssignment, MusicEvent } from '../types';
import {
  markPushPermissionAsked,
  usePushNotifications,
  wasPushPermissionAsked,
} from '../../notifications/usePushNotifications';

type RowItem = {
  event: MusicEvent;
  assignment: MusicAssignment;
};

export function MySchedulePage() {
  const qc = useQueryClient();
  const { requestPermission, isSupported } = usePushNotifications();
  const [permissionAsked, setPermissionAsked] = useState(wasPushPermissionAsked);
  const from = useMemo(() => new Date(), []);
  const to = useMemo(() => addWeeks(new Date(), 4), []);

  const scheduleQ = useQuery({
    queryKey: ['music-schedule', 'my', from.toISOString(), to.toISOString()],
    queryFn: () => fetchMyMusicSchedule(from, to),
  });

  const statusMut = useMutation({
    mutationFn: ({
      assignmentId,
      status,
    }: {
      assignmentId: number;
      status: 'confirmed' | 'declined';
    }) => updateMusicAssignmentStatus(assignmentId, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['music-schedule'] });
    },
  });

  const rows = useMemo((): RowItem[] => {
    const out: RowItem[] = [];
    for (const event of scheduleQ.data ?? []) {
      for (const assignment of event.assignments) {
        out.push({ event, assignment });
      }
    }
    out.sort((a, b) => a.event.event_date.localeCompare(b.event.event_date));
    return out;
  }, [scheduleQ.data]);

  const today = startOfDay(new Date());
  const pendingCount = rows.filter(
    ({ assignment, event }) =>
      !isBefore(parseISO(event.event_date), today) &&
      (assignment.status === 'assigned' || assignment.status === 'pending'),
  ).length;

  return (
    <div className="min-h-full bg-[var(--surface)] px-3 pb-28 pt-3 sm:px-4 sm:pb-12 sm:pt-4 shell:px-6 md:px-8">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <Link
            to="/schedules/music"
            className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-800 shadow-sm hover:bg-stone-50 active:bg-stone-100"
            aria-label="К расписанию"
          >
            <LuArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-stone-900 sm:text-2xl">Моё расписание</h1>
            <p className="text-[13px] font-semibold text-stone-500 sm:text-sm">
              Ближайшие 4 недели
              {pendingCount > 0 ? (
                <span className="ml-1.5 text-amber-700">· {pendingCount} ждут ответа</span>
              ) : null}
            </p>
          </div>
        </div>

        {isSupported && !permissionAsked && Notification.permission === 'default' ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 to-white px-4 py-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-extrabold text-sky-950">Включить уведомления о назначениях?</p>
              <p className="mt-0.5 text-xs font-semibold text-sky-800">
                Вы будете получать push, когда вас назначат на служение
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-extrabold text-sky-900"
                onClick={() => {
                  markPushPermissionAsked();
                  setPermissionAsked(true);
                }}
              >
                Позже
              </button>
              <button
                type="button"
                className="rounded-xl bg-primary px-3 py-2 text-sm font-extrabold text-white shadow-sm"
                onClick={async () => {
                  await requestPermission();
                  markPushPermissionAsked();
                  setPermissionAsked(true);
                }}
              >
                Включить
              </button>
            </div>
          </div>
        ) : null}

        {scheduleQ.isLoading ? (
          <div className="flex justify-center rounded-2xl border border-stone-200/80 bg-white py-16 shadow-[var(--shadow-card)]">
            <LuLoaderCircle className="h-8 w-8 animate-spin text-stone-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-6 py-14 text-center shadow-[var(--shadow-card)]">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-stone-100">
              <LuCalendarDays className="h-7 w-7 text-stone-400" />
            </div>
            <p className="font-extrabold text-stone-900">Нет назначений</p>
            <p className="mt-1 text-sm font-semibold text-stone-500">На ближайшие 4 недели служений нет</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map(({ event, assignment }) => {
              const past = isBefore(parseISO(event.event_date), today);
              const pending = assignment.status === 'assigned' || assignment.status === 'pending';
              return (
                <li
                  key={assignment.id}
                  className={[
                    'overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]',
                    past ? 'opacity-55 grayscale' : '',
                  ].join(' ')}
                >
                  <div
                    className="h-1 w-full"
                    style={{ backgroundColor: assignment.role.color }}
                  />
                  <div className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                          {format(parseISO(event.event_date), 'd MMMM, EEEE', { locale: ru })}
                          {event.start_time ? ` · ${event.start_time}` : ''}
                        </p>
                        <p className="mt-1 text-lg font-extrabold text-stone-900">{event.title}</p>
                        <span
                          className="mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold text-white shadow-sm"
                          style={{ backgroundColor: assignment.role.color }}
                        >
                          {assignment.role.name}
                        </span>
                      </div>
                      <div className="text-right text-sm">
                        {assignment.status === 'confirmed' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-800 ring-1 ring-emerald-200/80">
                            <LuCheck className="h-3.5 w-3.5" /> Подтверждено
                          </span>
                        ) : assignment.status === 'declined' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-extrabold text-rose-800 ring-1 ring-rose-200/80">
                            <LuX className="h-3.5 w-3.5" /> Отказался
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-800 ring-1 ring-amber-200/80">
                            {assignmentStatusLabel(assignment.status)}
                          </span>
                        )}
                      </div>
                    </div>
                    {!past && pending ? (
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          disabled={statusMut.isPending}
                          onClick={() =>
                            statusMut.mutate({ assignmentId: assignment.id, status: 'confirmed' })
                          }
                          className="tap-highlight-transparent min-h-[48px] flex-1 rounded-xl bg-[var(--btn-success-bg,#16a34a)] px-4 py-2.5 text-sm font-extrabold text-white shadow-sm disabled:opacity-50 sm:flex-none"
                        >
                          Подтвердить
                        </button>
                        <button
                          type="button"
                          disabled={statusMut.isPending}
                          onClick={() =>
                            statusMut.mutate({ assignmentId: assignment.id, status: 'declined' })
                          }
                          className="tap-highlight-transparent min-h-[48px] flex-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-extrabold text-rose-700 disabled:opacity-50 sm:flex-none"
                        >
                          Отказать
                        </button>
                      </div>
                    ) : null}
                    {statusMut.isError ? (
                      <p className="mt-2 text-sm font-semibold text-rose-600">{apiErrorMessage(statusMut.error)}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
