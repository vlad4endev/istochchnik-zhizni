import { format, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuPlus } from 'react-icons/lu';

import { AppAvatar } from '../../../components/AppAvatar';
import {
  assignmentStatusBorderColor,
  assignmentStatusLabel,
} from '../musicAccess';
import type { MusicEvent, MusicRole } from '../types';
import type { WeekEventColumn } from '../utils/musicScheduleWeekView';

type Props = {
  columns: WeekEventColumn[];
  activeRoles: MusicRole[];
  canManage: boolean;
  eventToneIndex: (eventId: number) => number;
  toneStyles: ReadonlyArray<{
    stripe: string;
    weekCard: string;
    title: string;
  }>;
  onAssign: (event: MusicEvent, roleId: number) => void;
  onContextMenu: (assignmentId: number, eventId: number) => void;
  onOpenEvent: (eventId: number) => void;
};

export function MusicSchedulePlanMobileCards({
  columns,
  activeRoles,
  canManage,
  eventToneIndex,
  toneStyles,
  onAssign,
  onContextMenu,
  onOpenEvent,
}: Props) {
  if (columns.length === 0) return null;

  return (
    <ul className="space-y-3 lg:hidden">
      {columns.map(({ day, event: ev }) => {
        const tone = toneStyles[eventToneIndex(ev.id)]!;
        const today = isToday(day);
        const filled = new Set(ev.assignments.map((a) => a.role_id)).size;

        return (
          <li key={`${ev.event_date}-${ev.id}`}>
            <article
              className={[
                'overflow-hidden rounded-2xl border shadow-[var(--shadow-card)]',
                tone.weekCard,
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => onOpenEvent(ev.id)}
                className="tap-highlight-transparent flex w-full items-start gap-3 border-b border-stone-100/80 px-4 py-3.5 text-left active:bg-white/40"
              >
                <span className={['mt-1 h-11 w-1 shrink-0 rounded-full', tone.stripe].join(' ')} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                      {format(day, 'EEEE', { locale: ru })}
                    </p>
                    {today ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                        Сегодня
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-base font-extrabold leading-snug text-stone-900">
                    {format(day, 'd MMMM yyyy', { locale: ru })}
                  </p>
                  <p className={['mt-1 text-sm font-extrabold leading-snug', tone.title].join(' ')}>
                    {ev.template_name?.trim() || ev.title}
                  </p>
                  {ev.start_time ? (
                    <p className="mt-0.5 text-xs font-semibold text-stone-500">{ev.start_time}</p>
                  ) : null}
                  {activeRoles.length > 0 ? (
                    <p className="mt-2 text-[11px] font-bold text-stone-500">
                      Назначено {filled} из {activeRoles.length} ролей
                    </p>
                  ) : null}
                </div>
              </button>

              <ul className="divide-y divide-stone-100/90 px-3 py-1">
                {activeRoles.map((roleRow) => {
                  const assignment = ev.assignments.find((a) => a.role_id === roleRow.id);
                  if (assignment) {
                    return (
                      <li key={roleRow.id}>
                        <button
                          type="button"
                          onClick={() => onContextMenu(assignment.id, ev.id)}
                          className="tap-highlight-transparent flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left active:bg-stone-50"
                        >
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: roleRow.color }}
                          />
                          <AppAvatar
                            src={assignment.member.avatar_url}
                            fallback={
                              <span className="text-[10px] font-bold text-white">
                                {assignment.member.name.slice(0, 1)}
                              </span>
                            }
                            initialsFallbackText={assignment.member.name}
                            className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-extrabold text-stone-900">
                              {assignment.member.name}
                            </span>
                            <span className="text-xs font-semibold text-stone-500">{roleRow.name}</span>
                          </div>
                          <span
                            className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-extrabold"
                            style={{
                              color: assignmentStatusBorderColor(assignment.status),
                              backgroundColor: `${assignmentStatusBorderColor(assignment.status)}14`,
                            }}
                          >
                            {assignmentStatusLabel(assignment.status)}
                          </span>
                        </button>
                      </li>
                    );
                  }

                  if (canManage) {
                    return (
                      <li key={roleRow.id}>
                        <button
                          type="button"
                          onClick={() => onAssign(ev, roleRow.id)}
                          className="tap-highlight-transparent flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-dashed border-stone-200 bg-white/70 px-3 py-2.5 text-left active:bg-primary/5"
                        >
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: roleRow.color }}
                          />
                          <span className="flex-1 text-sm font-semibold text-stone-500">{roleRow.name}</span>
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-primary">
                            Назначить
                            <LuPlus className="h-4 w-4" />
                          </span>
                        </button>
                      </li>
                    );
                  }

                  return (
                    <li key={roleRow.id}>
                      <div className="flex min-h-[44px] items-center gap-3 px-3 py-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full opacity-50"
                          style={{ backgroundColor: roleRow.color }}
                        />
                        <span className="text-sm font-semibold text-stone-400">{roleRow.name}</span>
                        <span className="ml-auto text-xs text-stone-300">—</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
