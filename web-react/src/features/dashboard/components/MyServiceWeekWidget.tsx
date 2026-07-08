import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import {
  LuCalendarDays,
  LuCheck,
  LuLoaderCircle,
  LuMusic2,
  LuRadio,
  LuSparkles,
  LuVideo,
  LuX,
} from 'react-icons/lu';
import type { IconType } from 'react-icons';

import {
  apiErrorMessage as musicApiError,
  updateMusicAssignmentStatus,
} from '../../musicSchedule/api';
import {
  apiErrorMessage as mediaApiError,
  updateMediaAssignmentStatus,
} from '../../mediaSchedule/api';
import { assignmentStatusLabel } from '../../musicSchedule/musicAccess';
import {
  useMyServiceWeekAssignments,
  type ServiceWeekAssignment,
  type ServiceWeekMinistry,
} from '../hooks/useMyServiceWeekAssignments';

const MINISTRY_META: Record<
  ServiceWeekMinistry,
  { label: string; Icon: IconType; accent: string; soft: string; ring: string }
> = {
  music: {
    label: 'Прославление',
    Icon: LuMusic2,
    accent: '#7C3AED',
    soft: '#F3E8FF',
    ring: '#DDD6FE',
  },
  media: {
    label: 'Трансляция',
    Icon: LuVideo,
    accent: '#0E7490',
    soft: '#E0F7FA',
    ring: '#A5F3FC',
  },
  sunday: {
    label: 'Собрание',
    Icon: LuSparkles,
    accent: '#6B2D3E',
    soft: '#F8F2F4',
    ring: '#E8D5DC',
  },
};

function isPending(status: ServiceWeekAssignment['status']): boolean {
  return status === 'assigned' || status === 'pending';
}

function AssignmentRow({
  item,
  onConfirm,
  onDecline,
  busy,
  errorText,
}: {
  item: ServiceWeekAssignment;
  onConfirm: (item: ServiceWeekAssignment) => void;
  onDecline: (item: ServiceWeekAssignment) => void;
  busy: boolean;
  errorText: string | null;
}) {
  const meta = MINISTRY_META[item.ministry];
  const Icon = meta.Icon;
  const pending = isPending(item.status);
  const accent = item.roleColor ?? meta.accent;

  return (
    <div
      className="overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-sm"
      style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.6) inset' }}
    >
      <div className="h-1 w-full" style={{ backgroundColor: accent }} />
      <div className="px-3.5 py-3.5 sm:px-4 sm:py-4">
        <div className="flex items-start gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset"
            style={{ backgroundColor: meta.soft, color: meta.accent, boxShadow: `inset 0 0 0 1px ${meta.ring}` }}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
                style={{ backgroundColor: meta.soft, color: meta.accent }}
              >
                {meta.label}
              </span>
              {item.status === 'confirmed' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 ring-1 ring-emerald-200/80">
                  <LuCheck className="h-3 w-3" aria-hidden />
                  Подтверждено
                </span>
              ) : item.status === 'declined' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold text-rose-800 ring-1 ring-rose-200/80">
                  <LuX className="h-3 w-3" aria-hidden />
                  Отказ
                </span>
              ) : pending ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 ring-1 ring-amber-200/80">
                  <LuRadio className="h-3 w-3 animate-pulse" aria-hidden />
                  {assignmentStatusLabel(item.status)}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-[15px] font-bold leading-snug text-stone-900 sm:text-base">
              {item.description}
            </p>
            {item.startTime ? (
              <p className="mt-1 text-xs font-semibold text-stone-500">Начало в {item.startTime}</p>
            ) : null}
          </div>
        </div>

        {pending && item.assignmentId != null ? (
          <div className="mt-3.5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => onConfirm(item)}
              className="tap-highlight-transparent inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--btn-success-bg,#16a34a)] px-4 text-sm font-extrabold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
            >
              <LuCheck className="h-4 w-4" aria-hidden />
              Подтвердить
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecline(item)}
              className="tap-highlight-transparent inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-extrabold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
            >
              <LuX className="h-4 w-4" aria-hidden />
              Отказать
            </button>
          </div>
        ) : null}
        {errorText ? (
          <p className="mt-2 text-xs font-semibold text-rose-600">{errorText}</p>
        ) : null}
      </div>
    </div>
  );
}

export function MyServiceWeekWidget({
  memberId,
  anchorServiceDate,
}: {
  memberId: number | null;
  anchorServiceDate?: string | null;
}) {
  const qc = useQueryClient();
  const { assignments, pendingCount, isLoading, hasAssignments, serviceDate } =
    useMyServiceWeekAssignments(memberId, anchorServiceDate, memberId != null);

  const statusMut = useMutation({
    mutationFn: async ({
      item,
      status,
    }: {
      item: ServiceWeekAssignment;
      status: 'confirmed' | 'declined';
    }) => {
      if (item.assignmentId == null) return;
      if (item.ministry === 'music') {
        await updateMusicAssignmentStatus(item.assignmentId, status);
        return;
      }
      if (item.ministry === 'media') {
        await updateMediaAssignmentStatus(item.assignmentId, status);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['music-schedule'] });
      void qc.invalidateQueries({ queryKey: ['media-schedule'] });
    },
  });

  if (memberId == null || isLoading || !hasAssignments) {
    return null;
  }

  const dateDt = parseISO(serviceDate);
  const dateLabel = Number.isNaN(dateDt.getTime())
    ? serviceDate
    : format(dateDt, 'EEEE, d MMMM', { locale: ru });

  const errorText = statusMut.isError
    ? musicApiError(statusMut.error) || mediaApiError(statusMut.error)
    : null;

  return (
    <section
      aria-label="Моё служение на этой неделе"
      className="min-w-0 overflow-hidden rounded-2xl border border-[#E8E0DC] bg-gradient-to-br from-[#FFFCFA] via-white to-[#F8F5F3] shadow-[var(--shadow-card)]"
    >
      <div className="border-b border-[#EDE5E1] bg-gradient-to-r from-[#6B2D3E]/[0.06] to-transparent px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#6B2D3E]">
              Твоё служение на этой неделе
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-stone-800">
                <LuCalendarDays className="h-4 w-4 shrink-0 text-[#6B2D3E]" aria-hidden />
                <span className="capitalize">{dateLabel}</span>
              </span>
              {pendingCount > 0 ? (
                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900">
                  {pendingCount} ждут ответа
                </span>
              ) : null}
            </div>
          </div>
          {statusMut.isPending ? (
            <LuLoaderCircle className="h-5 w-5 shrink-0 animate-spin text-stone-400" aria-hidden />
          ) : null}
        </div>
      </div>

      <div className="space-y-2.5 px-3 py-3 sm:space-y-3 sm:px-4 sm:py-4">
        {assignments.map((item) => (
          <AssignmentRow
            key={item.key}
            item={item}
            busy={statusMut.isPending}
            errorText={statusMut.isError ? errorText : null}
            onConfirm={(row) => statusMut.mutate({ item: row, status: 'confirmed' })}
            onDecline={(row) => statusMut.mutate({ item: row, status: 'declined' })}
          />
        ))}
      </div>

      <div className="border-t border-[#EDE5E1] px-4 py-2.5 sm:px-5">
        <Link
          to={
            assignments.length === 1
              ? assignments[0]!.scheduleLink
              : '/schedules'
          }
          className="inline-flex min-h-[36px] items-center text-xs font-extrabold text-[#6B2D3E] hover:underline"
        >
          {assignments.length === 1 ? 'Открыть расписание' : 'Все мои расписания'}
        </Link>
      </div>
    </section>
  );
}
