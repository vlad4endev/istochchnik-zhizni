import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addWeeks, format, isSunday, nextSunday, startOfDay } from 'date-fns';

import { fetchMyMusicSchedule } from '../../musicSchedule/api';
import { fetchMyMediaSchedule } from '../../mediaSchedule/api';
import { fetchMySundaySchedule } from '../../schedules/api/sundayScheduleApi';
import { mySundayRole } from '../../schedules/utils/sundayScheduleDisplay';
import type { MusicEvent } from '../../musicSchedule/types';
import type { MediaEvent } from '../../mediaSchedule/types';

export type ServiceWeekMinistry = 'music' | 'media' | 'sunday';

export type ServiceWeekAssignment = {
  key: string;
  ministry: ServiceWeekMinistry;
  assignmentId: number | null;
  eventDate: string;
  startTime: string | null;
  roleName: string;
  status: 'assigned' | 'confirmed' | 'declined' | 'pending' | 'info';
  description: string;
  scheduleLink: string;
  roleColor: string | null;
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

function musicDescription(roleName: string): string {
  return `Твоё служение в воскресенье в группе прославления — ${roleName}`;
}

function mediaDescription(roleName: string): string {
  return `Твоё служение в воскресенье на трансляции — ${roleName}`;
}

function sundayDescription(roleName: string): string {
  if (roleName === 'Ведущий') {
    return 'Твоё служение в воскресенье — Ведущий собрания';
  }
  return `Твоё служение в воскресенье — ${roleName}`;
}

function collectMusicRows(events: MusicEvent[], serviceDate: string): ServiceWeekAssignment[] {
  const out: ServiceWeekAssignment[] = [];
  for (const event of events) {
    if (event.event_date !== serviceDate) continue;
    for (const assignment of event.assignments) {
      out.push({
        key: `music-${assignment.id}`,
        ministry: 'music',
        assignmentId: assignment.id,
        eventDate: event.event_date,
        startTime: event.start_time ?? null,
        roleName: assignment.role.name,
        status: assignment.status,
        description: musicDescription(assignment.role.name),
        scheduleLink: '/schedules/music/my',
        roleColor: assignment.role.color,
      });
    }
  }
  return out;
}

function collectMediaRows(events: MediaEvent[], serviceDate: string): ServiceWeekAssignment[] {
  const out: ServiceWeekAssignment[] = [];
  for (const event of events) {
    if (event.event_date !== serviceDate) continue;
    for (const assignment of event.assignments) {
      out.push({
        key: `media-${assignment.id}`,
        ministry: 'media',
        assignmentId: assignment.id,
        eventDate: event.event_date,
        startTime: event.start_time ?? null,
        roleName: assignment.role.name,
        status: assignment.status,
        description: mediaDescription(assignment.role.name),
        scheduleLink: '/schedules/media/my',
        roleColor: assignment.role.color,
      });
    }
  }
  return out;
}

function collectSundayRows(
  plans: Awaited<ReturnType<typeof fetchMySundaySchedule>>,
  serviceDate: string,
  memberId: number | null,
): ServiceWeekAssignment[] {
  if (memberId == null) return [];
  const plan = plans.find((p) => p.service_date === serviceDate);
  if (!plan) return [];
  const role = mySundayRole(plan, memberId);
  if (!role) return [];
  return [
    {
      key: `sunday-${plan.id}-${role}`,
      ministry: 'sunday',
      assignmentId: null,
      eventDate: plan.service_date,
      startTime: plan.start_time ?? null,
      roleName: role,
      status: 'info',
      description: sundayDescription(role),
      scheduleLink: '/schedules/sunday/my',
      roleColor: '#6B2D3E',
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
    const rows = [
      ...collectMusicRows(musicQ.data ?? [], serviceDate),
      ...collectMediaRows(mediaQ.data ?? [], serviceDate),
      ...collectSundayRows(sundayQ.data ?? [], serviceDate, memberId),
    ];
    const ministryOrder: Record<ServiceWeekMinistry, number> = { sunday: 0, music: 1, media: 2 };
    return rows.sort((a, b) => ministryOrder[a.ministry] - ministryOrder[b.ministry]);
  }, [musicQ.data, mediaQ.data, sundayQ.data, serviceDate, memberId]);

  const pendingCount = assignments.filter(
    (a) => a.status === 'assigned' || a.status === 'pending',
  ).length;

  const isLoading = musicQ.isLoading || mediaQ.isLoading || sundayQ.isLoading;

  return {
    assignments,
    pendingCount,
    isLoading,
    serviceDate,
    hasAssignments: assignments.length > 0,
  };
}
