import { useQuery } from '@tanstack/react-query';
import { addWeeks, format, isSunday, nextSunday, startOfDay } from 'date-fns';
import { useMemo } from 'react';

import type { ServicePlanDetailsLite } from '../api/dashboard';
import { fetchMyMediaSchedule, type MediaEvent } from '../api/mediaSchedule';
import { fetchMyMusicSchedule } from '../api/musicSchedule';

export type ServiceMinistry = 'sunday' | 'music' | 'media';
export type RoleStatus = 'assigned' | 'confirmed' | 'declined' | 'pending' | 'info';

export type ServiceRoleSlot = {
  assignmentId: number | null;
  roleName: string;
  status: RoleStatus;
};

export type ServiceWeekCard = {
  key: string;
  ministry: ServiceMinistry;
  eventDate: string;
  startTime: string | null;
  title: string;
  roles: ServiceRoleSlot[];
};

const MINISTRY_ORDER: Record<ServiceMinistry, number> = { sunday: 0, music: 1, media: 2 };

export function isPendingStatus(s: RoleStatus): boolean {
  return s === 'assigned' || s === 'pending';
}

/** Воскресенье, на которое смотрим: дата ближайшего богослужения или ближайшее воскресенье. */
export function resolveAnchorSunday(anchor: string | null | undefined): string {
  if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) return anchor;
  const today = startOfDay(new Date());
  return format(isSunday(today) ? today : nextSunday(today), 'yyyy-MM-dd');
}

function cardsFromEvents(
  events: MediaEvent[],
  ministry: 'music' | 'media',
  serviceDate: string,
): ServiceWeekCard[] {
  const out: ServiceWeekCard[] = [];
  for (const ev of events) {
    if (ev.event_date !== serviceDate || ev.assignments.length === 0) continue;
    out.push({
      key: `${ministry}:${ev.event_ref_id}`,
      ministry,
      eventDate: ev.event_date,
      startTime: ev.start_time ?? null,
      title: ev.template_name?.trim() || ev.title?.trim() || 'Воскресное богослужение',
      roles: ev.assignments.map((a) => ({
        assignmentId: a.id,
        roleName: a.role.name,
        status: a.status,
      })),
    });
  }
  return out;
}

/** Роль на собрании берём из плана служения: ведущий или проповедник. */
function sundayCard(
  plan: ServicePlanDetailsLite | null | undefined,
  memberId: number | null,
  serviceDate: string,
): ServiceWeekCard | null {
  if (!plan || memberId == null || plan.service_date !== serviceDate) return null;
  const roles: ServiceRoleSlot[] = [];
  if (plan.leader_member_id === memberId) {
    roles.push({ assignmentId: null, roleName: 'Ведущий', status: 'info' });
  }
  if (plan.preacher_member_id === memberId) {
    roles.push({ assignmentId: null, roleName: 'Проповедник', status: 'info' });
  }
  if (roles.length === 0) return null;
  return {
    key: `sunday:${plan.id}`,
    ministry: 'sunday',
    eventDate: plan.service_date,
    startTime: plan.start_time ?? null,
    title: plan.template_name?.trim() || 'Собрание',
    roles,
  };
}

export function useMyServiceWeek(params: {
  memberId: number | null;
  anchorServiceDate: string | null;
  anchorPlan: ServicePlanDetailsLite | null;
}) {
  const { memberId, anchorServiceDate, anchorPlan } = params;
  const serviceDate = useMemo(() => resolveAnchorSunday(anchorServiceDate), [anchorServiceDate]);
  const range = useMemo(() => {
    const from = new Date();
    return { from, to: addWeeks(from, 4) };
  }, []);

  const musicQuery = useQuery({
    queryKey: ['music-schedule', 'my', 'dashboard', serviceDate],
    queryFn: () => fetchMyMusicSchedule(range.from, range.to),
    enabled: memberId != null,
    staleTime: 60_000,
  });
  const mediaQuery = useQuery({
    queryKey: ['media-schedule', 'my', 'dashboard', serviceDate],
    queryFn: () => fetchMyMediaSchedule(range.from, range.to),
    enabled: memberId != null,
    staleTime: 60_000,
  });

  const cards = useMemo(() => {
    const all = [
      sundayCard(anchorPlan, memberId, serviceDate),
      ...cardsFromEvents(musicQuery.data ?? [], 'music', serviceDate),
      ...cardsFromEvents(mediaQuery.data ?? [], 'media', serviceDate),
    ].filter((c): c is ServiceWeekCard => c != null);
    return all.sort((a, b) => MINISTRY_ORDER[a.ministry] - MINISTRY_ORDER[b.ministry]);
  }, [anchorPlan, memberId, serviceDate, musicQuery.data, mediaQuery.data]);

  return {
    cards,
    isLoading: musicQuery.isLoading || mediaQuery.isLoading,
    refetch: async () => {
      await Promise.all([musicQuery.refetch(), mediaQuery.refetch()]);
    },
  };
}
