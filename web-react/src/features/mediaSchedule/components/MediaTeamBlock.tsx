import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LuLoaderCircle, LuPencil } from 'react-icons/lu';

import { AppAvatar } from '../../../components/AppAvatar';
import { CollapsibleBroadcastTeamShell } from '../../servicePlanner/components/CollapsibleBroadcastTeamShell';
import {
  assignmentStatusBorderColor,
  assignmentStatusLabel,
} from '../mediaAccess';
import { fetchMediaAssignmentsForPlan, fetchMediaEventByPlanId } from '../api';
import type { MediaAssignment } from '../types';

type Props = {
  planId: number | null;
  canManage?: boolean;
  compact?: boolean;
  /** Внутри «Настройки плана» — компактный блок только для просмотра */
  embedded?: boolean;
  title?: string;
};

export function MediaTeamBlock({
  planId,
  canManage = false,
  compact = false,
  embedded = false,
  title,
}: Props) {
  const eventQ = useQuery({
    queryKey: ['media-schedule', 'plan', planId],
    queryFn: () => fetchMediaEventByPlanId(planId!),
    enabled: planId != null && planId > 0,
  });

  const assignmentsQ = useQuery({
    queryKey: ['media-schedule', 'plan-assignments', planId],
    queryFn: () => fetchMediaAssignmentsForPlan(planId!),
    enabled: planId != null && planId > 0,
  });

  if (planId == null || planId <= 0) {
    return null;
  }

  const loading = eventQ.isLoading || assignmentsQ.isLoading;
  const assignments = assignmentsQ.data ?? eventQ.data?.assignments ?? [];
  const event = eventQ.data;
  const showManageActions = canManage && !embedded;
  const heading = title ?? (embedded ? 'Участники трансляции' : 'Медиа-команда');

  const content = loading ? (
    <div
      className={[
        'flex justify-center text-[var(--text-muted)]',
        embedded ? 'py-2' : 'py-4',
      ].join(' ')}
    >
      <LuLoaderCircle className={embedded ? 'h-4 w-4 animate-spin' : 'h-5 w-5 animate-spin'} />
    </div>
  ) : assignments.length === 0 ? (
    <p className={embedded ? 'text-xs text-stone-500' : 'text-sm text-[var(--text-muted)]'}>
      Назначений пока нет.
      {showManageActions ? (
        <>
          {' '}
          <Link to={`/media-schedule?planId=${planId}`} className="font-semibold text-primary">
            Назначить команду
          </Link>
        </>
      ) : null}
    </p>
  ) : (
    <ul className={embedded ? 'space-y-1' : 'space-y-2'}>
      {assignments.map((a) => (
        <AssignmentRow key={a.id} assignment={a} embedded={embedded} />
      ))}
    </ul>
  );

  if (embedded) {
    return (
      <CollapsibleBroadcastTeamShell
        title={heading}
        count={loading ? null : assignments.length}
      >
        {content}
      </CollapsibleBroadcastTeamShell>
    );
  }

  return (
    <section
      className={[
        'rounded-2xl border border-[var(--border)] bg-[var(--surface)]',
        compact ? 'px-3 py-3' : 'px-4 py-4',
      ].join(' ')}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--text)]">{heading}</h3>
        {showManageActions ? (
          <Link
            to={`/media-schedule?planId=${planId}`}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            <LuPencil className="h-3.5 w-3.5" />
            Редактировать
          </Link>
        ) : null}
      </div>

      {content}

      {event?.title && !compact ? (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">{event.title}</p>
      ) : null}
    </section>
  );
}

function AssignmentRow({ assignment, embedded = false }: { assignment: MediaAssignment; embedded?: boolean }) {
  if (embedded) {
    return (
      <li className="flex min-w-0 items-center gap-1.5 text-xs leading-snug text-stone-700">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: assignment.role.color }}
          aria-hidden
        />
        <span className="shrink-0 font-semibold text-stone-500">{assignment.role.name}</span>
        <span className="shrink-0 text-stone-400" aria-hidden>
          —
        </span>
        <span className="min-w-0 truncate font-medium">{assignment.member.name}</span>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 rounded-xl bg-[var(--surface-elevated)] px-2.5 py-2 ring-1 ring-[var(--border)]">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: assignment.role.color }}
        aria-hidden
      />
      <span className="w-20 shrink-0 truncate text-xs font-semibold text-[var(--text-muted)]">
        {assignment.role.name}
      </span>
      <AppAvatar
        src={assignment.member.avatar_url}
        fallback={
          <span className="text-[10px] font-bold text-white">
            {assignment.member.name.slice(0, 1).toUpperCase()}
          </span>
        }
        initialsFallbackText={assignment.member.name}
        className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full"
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{assignment.member.name}</span>
      <span
        className="shrink-0 text-[11px] font-semibold"
        style={{ color: assignmentStatusBorderColor(assignment.status) }}
      >
        {assignmentStatusLabel(assignment.status)}
      </span>
    </li>
  );
}
