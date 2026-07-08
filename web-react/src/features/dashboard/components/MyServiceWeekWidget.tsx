import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import {
  LuCheck,
  LuClock3,
  LuExternalLink,
  LuLoaderCircle,
  LuMusic2,
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
import {
  useMyServiceWeekAssignments,
  type ServiceWeekAssignment,
  type ServiceWeekMinistry,
} from '../hooks/useMyServiceWeekAssignments';

const MAROON = '#732B38';

const MINISTRY_META: Record<
  ServiceWeekMinistry,
  { label: string; Icon: IconType; chipBg: string; chipColor: string }
> = {
  music: {
    label: 'Прославление',
    Icon: LuMusic2,
    chipBg: '#F3E8FF',
    chipColor: '#7C3AED',
  },
  media: {
    label: 'Трансляция',
    Icon: LuVideo,
    chipBg: '#E0F2FE',
    chipColor: '#0369A1',
  },
  sunday: {
    label: 'Собрание',
    Icon: LuSparkles,
    chipBg: '#F8F2F4',
    chipColor: MAROON,
  },
};

function isPending(status: ServiceWeekAssignment['status']): boolean {
  return status === 'assigned' || status === 'pending';
}

function formatServiceTime(startTime: string | null): string | null {
  const raw = startTime?.trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  return `${match[1]!.padStart(2, '0')}:${match[2]}`;
}

function DateSidebar({ eventDate }: { eventDate: string }) {
  const dt = parseISO(eventDate);
  const weekday = Number.isNaN(dt.getTime()) ? 'ВС' : format(dt, 'EEEEEE', { locale: ru }).toUpperCase();
  const day = Number.isNaN(dt.getTime()) ? '—' : format(dt, 'd');
  const month = Number.isNaN(dt.getTime()) ? '' : format(dt, 'LLLL', { locale: ru });

  return (
    <div
      className="flex w-[74px] shrink-0 flex-col items-center justify-center gap-0.5 border-r border-dashed border-white/35 px-2 py-4 sm:w-[82px] sm:py-5"
      style={{ backgroundColor: MAROON }}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/85">{weekday}</span>
      <span className="text-[34px] font-bold leading-none text-white sm:text-[38px]">{day}</span>
      <span className="text-[11px] font-semibold capitalize text-white/90">{month}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: ServiceWeekAssignment['status'] }) {
  if (status === 'confirmed') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#E8F5EC] px-2.5 py-1 text-[11px] font-bold text-[#2F6B3C]">
        <span className="grid h-4 w-4 place-items-center rounded-[4px] bg-[#C8E6D0] text-[#2F6B3C]">
          <LuCheck className="h-3 w-3" strokeWidth={3} aria-hidden />
        </span>
        Подтверждено
      </span>
    );
  }
  if (status === 'declined') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200/80">
        <LuX className="h-3 w-3" aria-hidden />
        Отказ
      </span>
    );
  }
  if (isPending(status)) {
    return (
      <span className="inline-flex shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200/80">
        Нужен ответ
      </span>
    );
  }
  return null;
}

function ServiceCard({
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
  const timeLabel = formatServiceTime(item.startTime);

  return (
    <article className="flex min-w-0 overflow-hidden rounded-[18px] border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <DateSidebar eventDate={item.eventDate} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
                style={{ backgroundColor: meta.chipBg, color: meta.chipColor }}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </span>
              <span className="text-sm font-medium text-stone-500">{meta.label}</span>
            </div>
            <StatusBadge status={item.status} />
          </div>

          <div className="mt-3 min-w-0">
            <h3 className="text-[17px] font-bold leading-snug text-stone-900 sm:text-lg">
              Служение: {item.roleName}
            </h3>
            <p className="mt-1 text-sm font-medium text-stone-500">{item.eventTitle}</p>
          </div>

          {pending && item.assignmentId != null ? (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onConfirm(item)}
                className="tap-highlight-transparent inline-flex min-h-[40px] flex-1 items-center justify-center rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: MAROON }}
              >
                Подтвердить
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecline(item)}
                className="tap-highlight-transparent inline-flex min-h-[40px] flex-1 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-sm font-bold text-stone-700 disabled:opacity-50"
              >
                Отказать
              </button>
            </div>
          ) : null}
          {errorText ? <p className="mt-2 text-xs font-semibold text-rose-600">{errorText}</p> : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-4 py-2.5 sm:px-5">
          <div className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-stone-500">
            <LuClock3 className="h-4 w-4 shrink-0" aria-hidden />
            <span className="tabular-nums">{timeLabel ?? '—'}</span>
          </div>
          <Link
            to={item.scheduleLink}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-bold hover:underline"
            style={{ color: MAROON }}
          >
            Подробнее
            <LuExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
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
  const { assignments, isLoading, hasAssignments } = useMyServiceWeekAssignments(
    memberId,
    anchorServiceDate,
    memberId != null,
  );

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

  const errorText = statusMut.isError
    ? musicApiError(statusMut.error) || mediaApiError(statusMut.error)
    : null;

  return (
    <section aria-label="Твоё служение на этой неделе" className="min-w-0">
      <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
        <h2
          className="text-[11px] font-bold uppercase tracking-[0.1em]"
          style={{ color: MAROON }}
        >
          Твоё служение на этой неделе
        </h2>
        {statusMut.isPending ? (
          <LuLoaderCircle className="h-4 w-4 shrink-0 animate-spin text-stone-400" aria-hidden />
        ) : null}
      </div>

      <div className="space-y-3">
        {assignments.map((item) => (
          <ServiceCard
            key={item.key}
            item={item}
            busy={statusMut.isPending}
            errorText={statusMut.isError ? errorText : null}
            onConfirm={(row) => statusMut.mutate({ item: row, status: 'confirmed' })}
            onDecline={(row) => statusMut.mutate({ item: row, status: 'declined' })}
          />
        ))}
      </div>
    </section>
  );
}
