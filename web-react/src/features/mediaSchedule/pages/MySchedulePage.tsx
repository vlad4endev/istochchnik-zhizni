import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { addWeeks, format, isBefore, parseISO, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuArrowLeft, LuCalendarDays, LuCheck, LuLoaderCircle, LuX } from 'react-icons/lu';

import {
  apiErrorMessage,
  fetchMyMediaSchedule,
  updateMediaAssignmentStatus,
} from '../api';
import { assignmentStatusLabel } from '../mediaAccess';
import type { MediaAssignment, MediaEvent } from '../types';
import {
  markPushPermissionAsked,
  usePushNotifications,
  wasPushPermissionAsked,
} from '../../notifications/usePushNotifications';

type RowItem = {
  event: MediaEvent;
  assignment: MediaAssignment;
};

export function MySchedulePage() {
  const qc = useQueryClient();
  const { requestPermission, isSupported } = usePushNotifications();
  const [permissionAsked, setPermissionAsked] = useState(wasPushPermissionAsked);
  const from = useMemo(() => new Date(), []);
  const to = useMemo(() => addWeeks(new Date(), 4), []);

  const scheduleQ = useQuery({
    queryKey: ['media-schedule', 'my', from.toISOString(), to.toISOString()],
    queryFn: () => fetchMyMediaSchedule(from, to),
  });

  const statusMut = useMutation({
    mutationFn: ({
      assignmentId,
      status,
    }: {
      assignmentId: number;
      status: 'confirmed' | 'declined';
    }) => updateMediaAssignmentStatus(assignmentId, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['media-schedule'] });
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6">
      <div className="flex items-center gap-3">
        <Link
          to="/media-schedule"
          className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)]"
          aria-label="К расписанию"
        >
          <LuArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Моё расписание</h1>
          <p className="text-sm text-[var(--text-muted)]">Ближайшие 4 недели</p>
        </div>
      </div>

      {isSupported && !permissionAsked && Notification.permission === 'default' ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-sky-950">Включить уведомления о назначениях?</p>
            <p className="mt-0.5 text-xs text-sky-800">
              Вы будете получать push, когда вас назначат на служение
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold"
              onClick={() => {
                markPushPermissionAsked();
                setPermissionAsked(true);
              }}
            >
              Позже
            </button>
            <button
              type="button"
              className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
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
        <div className="flex justify-center py-16 text-[var(--text-muted)]">
          <LuLoaderCircle className="h-8 w-8 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-12 text-center">
          <LuCalendarDays className="mx-auto mb-3 h-10 w-10 text-[var(--text-muted)]" />
          <p className="font-medium">Нет назначений на ближайшие недели</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ event, assignment }) => {
            const past = isBefore(parseISO(event.event_date), today);
            const pending = assignment.status === 'assigned' || assignment.status === 'pending';
            return (
              <li
                key={assignment.id}
                className={[
                  'rounded-2xl border border-[var(--border)] px-4 py-3',
                  past ? 'opacity-55 grayscale' : 'bg-[var(--surface-elevated)]',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-muted)]">
                      {format(parseISO(event.event_date), 'd MMMM, EEEE', { locale: ru })}
                      {event.start_time ? ` · ${event.start_time}` : ''}
                    </p>
                    <p className="text-base font-bold">{event.title}</p>
                    <span
                      className="mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: assignment.role.color }}
                    >
                      {assignment.role.name}
                    </span>
                  </div>
                  <div className="text-right text-sm">
                    {assignment.status === 'confirmed' ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <LuCheck className="h-4 w-4" /> Подтверждено
                      </span>
                    ) : assignment.status === 'declined' ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                        <LuX className="h-4 w-4" /> Отказался
                      </span>
                    ) : (
                      <span className="font-medium text-amber-700">
                        {assignmentStatusLabel(assignment.status)}
                      </span>
                    )}
                  </div>
                </div>
                {!past && pending ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={statusMut.isPending}
                      onClick={() =>
                        statusMut.mutate({ assignmentId: assignment.id, status: 'confirmed' })
                      }
                      className="rounded-xl bg-[var(--btn-success-bg,#16a34a)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Подтвердить
                    </button>
                    <button
                      type="button"
                      disabled={statusMut.isPending}
                      onClick={() =>
                        statusMut.mutate({ assignmentId: assignment.id, status: 'declined' })
                      }
                      className="rounded-xl bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Отказать
                    </button>
                  </div>
                ) : null}
                {statusMut.isError ? (
                  <p className="mt-2 text-sm text-rose-600">{apiErrorMessage(statusMut.error)}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
