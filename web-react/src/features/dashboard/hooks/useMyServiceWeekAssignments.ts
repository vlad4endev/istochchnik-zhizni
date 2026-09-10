import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addWeeks, format, isSunday, nextSunday, startOfDay } from 'date-fns';

import { fetchMyMusicSchedule } from '../../musicSchedule/api';
import { fetchMyMediaSchedule } from '../../mediaSchedule/api';
import { fetchMySundaySchedule } from '../../schedules/api/sundayScheduleApi';
import { mySundayRole, serviceTitle } from '../../schedules/utils/sundayScheduleDisplay';
import type { MusicEvent } from '../../musicSchedule/types';
import type { MediaEvent } from '../../mediaSchedule/types';

export type ServiceWeekMinistry = 'music' | 'media' | 'sunday';

export type ServiceWeekRoleStatus = 'assigned' | 'confirmed' | 'declined' | 'pending' | 'info';

export type ServiceWeekRoleSlot = {
  assignmentId: number | null;
  roleName: string;
  roleColor: string | null;
  status: ServiceWeekRoleStatus;
};

/** Одна карточка = одно служение (событие); внутри может быть несколько позиций. */
export type ServiceWeekAssignment = {
  key: string;
  ministry: ServiceWeekMinistry;
  eventRefId: number | null;
  eventDate: string;
  startTime: string | null;
  eventTitle: string;
  description: string;
  scheduleLink: string;
  roles: ServiceWeekRoleSlot[];
};

type ServiceWeekRoleRow = {
  key: string;
  ministry: ServiceWeekMinistry;
  eventRefId: number | null;
  eventDate: string;
  startTime: string | null;
  eventTitle: string;
  description: string;
  scheduleLink: string;
  role: ServiceWeekRoleSlot;
};

function formatYmd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function resolveAnchorSundayDate(anchor: string | null | undefined): string {
  if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) return anchor;
  const today = startOfDay(new Date());
  const sunday = isSunday(today) ? today : nextSunday(today);
  return formatYmd(sunday);
}

function musicDescription(roleNames: string[]): string {
  return `Твоё служение в воскресенье в группе прославления — ${roleNames.join(', ')}`;
}

function mediaDescription(roleNames: string[]): string {
  return `Твоё служение в воскресенье на трансляции — ${roleNames.join(', ')}`;
}

function sundayDescription(roleName: string): string {
  if (roleName === 'Ведущий') {
    return 'Твоё служение в воскресенье — Ведущий собрания';
  }
  return `Твоё служение в воскресенье — ${roleName}`;
}

function eventLabel(title: string, templateName?: string | null): string {
  const name = templateName?.trim() || title.trim();
  return name || 'Воскресное богослужение';
}

/** Collapse duplicate event payloads so each assignment id appears once. */
export function dedupeServiceWeekRoleRows(rows: ServiceWeekRoleRow[]): ServiceWeekRoleRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });
}

/** @deprecated use dedupeServiceWeekRoleRows — kept for older test imports */
export function dedupeServiceWeekAssignments(
  rows: ServiceWeekAssignment[],
): ServiceWeekAssignment[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });
}

function groupKey(row: ServiceWeekRoleRow): string {
  if (row.eventRefId != null) return `${row.ministry}:${row.eventRefId}`;
  return `${row.ministry}:${row.eventDate}:${row.startTime ?? ''}:${row.eventTitle}`;
}

/** Объединяет позиции одного служения в одну карточку. */
export function mergeServiceWeekRoleRows(rows: ServiceWeekRoleRow[]): ServiceWeekAssignment[] {
  const order: string[] = [];
  const buckets = new Map<string, ServiceWeekRoleRow[]>();

  for (const row of dedupeServiceWeekRoleRows(rows)) {
    const key = groupKey(row);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(row);
  }

  return order.map((key) => {
    const group = buckets.get(key)!;
    const head = group[0]!;
    const roles = group.map((r) => r.role);
    const roleNames = roles.map((r) => r.roleName);
    const description =
      head.ministry === 'music'
        ? musicDescription(roleNames)
        : head.ministry === 'media'
          ? mediaDescription(roleNames)
          : head.description;

    return {
      key,
      ministry: head.ministry,
      eventRefId: head.eventRefId,
      eventDate: head.eventDate,
      startTime: head.startTime,
      eventTitle: head.eventTitle,
      description,
      scheduleLink: head.scheduleLink,
      roles,
    };
  });
}

export function aggregateServiceWeekStatus(
  roles: ServiceWeekRoleSlot[],
): ServiceWeekRoleStatus {
  if (roles.some((r) => r.status === 'assigned' || r.status === 'pending')) return 'pending';
  if (roles.some((r) => r.status === 'declined')) return 'declined';
  if (roles.length > 0 && roles.every((r) => r.status === 'confirmed')) return 'confirmed';
  return 'info';
}

export function collectMusicRows(events: MusicEvent[], serviceDate: string): ServiceWeekRoleRow[] {
  const out: ServiceWeekRoleRow[] = [];
  for (const event of events) {
    if (event.event_date !== serviceDate) continue;
    for (const assignment of event.assignments) {
      out.push({
        key: `music-${assignment.id}`,
        ministry: 'music',
        eventRefId: event.event_ref_id ?? event.id ?? null,
        eventDate: event.event_date,
        startTime: event.start_time ?? null,
        eventTitle: eventLabel(event.title, event.template_name),
        description: musicDescription([assignment.role.name]),
        scheduleLink: '/schedules/music/my',
        role: {
          assignmentId: assignment.id,
          roleName: assignment.role.name,
          roleColor: assignment.role.color,
          status: assignment.status,
        },
      });
    }
  }
  return out;
}

export function collectMediaRows(events: MediaEvent[], serviceDate: string): ServiceWeekRoleRow[] {
  const out: ServiceWeekRoleRow[] = [];
  for (const event of events) {
    if (event.event_date !== serviceDate) continue;
    for (const assignment of event.assignments) {
      out.push({
        key: `media-${assignment.id}`,
        ministry: 'media',
        eventRefId: event.event_ref_id ?? event.id ?? null,
        eventDate: event.event_date,
        startTime: event.start_time ?? null,
        eventTitle: eventLabel(event.title, event.template_name),
        description: mediaDescription([assignment.role.name]),
        scheduleLink: '/schedules/media/my',
        role: {
          assignmentId: assignment.id,
          roleName: assignment.role.name,
          roleColor: assignment.role.color,
          status: assignment.status,
        },
      });
    }
  }
  return out;
}

function collectSundayRows(
  plans: Awaited<ReturnType<typeof fetchMySundaySchedule>>,
  serviceDate: string,
  memberId: number | null,
): ServiceWeekRoleRow[] {
  if (memberId == null) return [];
  const plan = plans.find((p) => p.service_date === serviceDate);
  if (!plan) return [];
  const role = mySundayRole(plan, memberId);
  if (!role) return [];
  return [
    {
      key: `sunday-${plan.id}-${role}`,
      ministry: 'sunday',
      eventRefId: plan.id,
      eventDate: plan.service_date,
      startTime: plan.start_time ?? null,
      eventTitle: serviceTitle(plan),
      description: sundayDescription(role),
      scheduleLink: '/schedules/sunday/my',
      role: {
        assignmentId: null,
        roleName: role,
        roleColor: '#6B2D3E',
        status: 'info',
      },
    },
  ];
}

export function useMyServiceWeekAssignments(
  memberId: number | null,
  anchorServiceDate: string | null | undefined,
  enabled = true,
) {
  const serviceDate = useMemo(() => resolveAnchorSundayDate(anchorServiceDate), [anchorServiceDate]);
  const from = useMemo(() => new Date(), []);
  const to = useMemo(() => addWeeks(new Date(), 4), []);

  const musicQ = useQuery({
    queryKey: ['music-schedule', 'my', 'dashboard', from.toISOString(), to.toISOString()],
    queryFn: () => fetchMyMusicSchedule(from, to),
    enabled: enabled && memberId != null,
    staleTime: 60_000,
  });

  const mediaQ = useQuery({
    queryKey: ['media-schedule', 'my', 'dashboard', from.toISOString(), to.toISOString()],
    queryFn: () => fetchMyMediaSchedule(from, to),
    enabled: enabled && memberId != null,
    staleTime: 60_000,
  });

  const sundayQ = useQuery({
    queryKey: ['sunday-schedule', 'my', 'dashboard', serviceDate],
    queryFn: () =>
      fetchMySundaySchedule({
        from: serviceDate,
        to: serviceDate,
      }),
    enabled: enabled && memberId != null,
    staleTime: 60_000,
  });

  const assignments = useMemo((): ServiceWeekAssignment[] => {
    const rows = mergeServiceWeekRoleRows([
      ...collectMusicRows(musicQ.data ?? [], serviceDate),
      ...collectMediaRows(mediaQ.data ?? [], serviceDate),
      ...collectSundayRows(sundayQ.data ?? [], serviceDate, memberId),
    ]);
    const ministryOrder: Record<ServiceWeekMinistry, number> = { sunday: 0, music: 1, media: 2 };
    return rows.sort((a, b) => ministryOrder[a.ministry] - ministryOrder[b.ministry]);
  }, [musicQ.data, mediaQ.data, sundayQ.data, serviceDate, memberId]);

  const pendingCount = assignments.reduce(
    (sum, card) =>
      sum + card.roles.filter((r) => r.status === 'assigned' || r.status === 'pending').length,
    0,
  );

  const isLoading = musicQ.isLoading || mediaQ.isLoading || sundayQ.isLoading;

  return {
    assignments,
    pendingCount,
    isLoading,
    serviceDate,
    hasAssignments: assignments.length > 0,
  };
}
