import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

import { fetchActiveBroadcast } from '../../../api/broadcast';
import { fetchPodcastFeed } from '../../../api/resources';
import {
  fetchDashboardCoordinatorNotes,
  formatCalendarDayKey,
  getActiveEvents,
  getCalendarDay,
  getWeekBirthdays,
} from '../../calendar/api';
import { fetchProfileByMemberId, fetchProfileByUsername } from '../../profile/publicProfileApi';
import { fetchServicePlan, fetchServicePlans } from '../../servicePlanner/api';
import { useMe } from '@/hooks/useMe';
import { useAuthStore } from '../../auth/authStore';
import { keys } from '@/lib/queryKeys';
import {
  formatBirthdayLabel,
  getTimeUntilService,
  getUpcomingBirthdays,
  isSermonRelevant,
  isStreamLive,
} from '../utils/dashboardHelpers';

function parseServiceDateTime(plan) {
  const date = String(plan?.service_date ?? '').trim();
  const time = String(plan?.start_time ?? '').trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const dt = new Date(`${date}T${time}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function pickNearestPlan(plans) {
  const now = Date.now();
  return (plans ?? [])
    .map((plan) => {
      const startsAt = parseServiceDateTime(plan);
      return startsAt ? { plan, startsAt } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .find((row) => row.startsAt.getTime() >= now)?.plan ?? null;
}

function extractSermonBlock(planDetails) {
  if (!planDetails?.blocks?.length) return null;
  return planDetails.blocks.find((block) => {
    const topic = typeof block.content_json?.sermon_topic === 'string' ? block.content_json.sermon_topic.trim() : '';
    const scripture = typeof block.content_json?.sermon_scripture === 'string' ? block.content_json.sermon_scripture.trim() : '';
    return topic.length > 0 && scripture.length > 0;
  }) ?? null;
}

function normalizePrayerType(text) {
  const value = String(text ?? '').toLowerCase();
  if (value.includes('сроч') || value.includes('urgent')) return 'urgent';
  if (value.includes('хвала') || value.includes('благодар')) return 'praise';
  return 'active';
}

export function useDashboardData() {
  const meQ = useMe();
  const username = useAuthStore((s) => s.username ?? '');
  const memberId = useAuthStore((s) => s.memberId);
  const now = new Date();
  const todayKey = formatCalendarDayKey(now);
  const profileSlug = username.trim() || (memberId != null ? `member-${memberId}` : '');

  const profileQ = useQuery({
    queryKey: ['profile', 'member-dashboard', profileSlug],
    queryFn: () => fetchProfileByUsername(profileSlug),
    enabled: profileSlug.length > 0,
    staleTime: 60_000,
  });

  const birthdaysQ = useQuery({
    queryKey: ['calendar', 'birthdays', 'member-dashboard', todayKey],
    queryFn: getWeekBirthdays,
    staleTime: 60_000,
  });

  const prayersQ = useQuery({
    queryKey: keys.calendarDay(todayKey),
    queryFn: () => getCalendarDay(todayKey),
    staleTime: 60_000,
  });

  const notesQ = useQuery({
    queryKey: keys.dashboardNotes(todayKey),
    queryFn: () => fetchDashboardCoordinatorNotes(todayKey),
    staleTime: 60_000,
  });

  const eventsQ = useQuery({
    queryKey: keys.events,
    queryFn: getActiveEvents,
    staleTime: 60_000,
  });

  const broadcastQ = useQuery({
    queryKey: keys.broadcast,
    queryFn: fetchActiveBroadcast,
    staleTime: 60_000,
  });

  const podcastsQ = useQuery({
    queryKey: ['resources', 'podcasts', 'member-dashboard'],
    queryFn: () => fetchPodcastFeed({ limit: 10 }),
    staleTime: 60_000,
  });

  const plansQ = useQuery({
    queryKey: ['service-plans', 'member-dashboard', todayKey],
    queryFn: () => fetchServicePlans({ from: todayKey }),
    staleTime: 60_000,
  });

  const nearestPlan = useMemo(() => pickNearestPlan(plansQ.data ?? []), [plansQ.data]);

  const planDetailsQ = useQuery({
    queryKey: ['service-plan', 'member-dashboard', nearestPlan?.id ?? null],
    queryFn: () => fetchServicePlan(nearestPlan.id),
    enabled: nearestPlan != null,
    staleTime: 60_000,
  });

  const sermonBlock = useMemo(() => extractSermonBlock(planDetailsQ.data), [planDetailsQ.data]);

  const preacherQ = useQuery({
    queryKey: ['profile', 'preacher', planDetailsQ.data?.preacher_member_id ?? null],
    queryFn: () => fetchProfileByMemberId(planDetailsQ.data.preacher_member_id),
    enabled: Number.isFinite(planDetailsQ.data?.preacher_member_id),
    staleTime: 60_000,
  });

  const sermonDate = nearestPlan ? parseServiceDateTime(nearestPlan) : null;
  const sermon = useMemo(() => {
    if (!sermonBlock || !nearestPlan || !sermonDate) return null;
    const preacherProfile = preacherQ.data?.profile;
    const preacherName = [preacherProfile?.first_name, preacherProfile?.last_name].filter(Boolean).join(' ').trim() || nearestPlan.preacher_name || 'Проповедник';
    const topic = String(sermonBlock.content_json?.sermon_topic ?? '').trim();
    const verseRef = String(sermonBlock.content_json?.sermon_scripture ?? '').trim();
    const verseUrl = `https://www.bible.com/ru/search/bible?q=${encodeURIComponent(verseRef)}`;
    if (!isSermonRelevant({ date: sermonDate })) return null;
    return {
      preacher: preacherName,
      topic,
      verseRef,
      verseUrl,
      date: sermonDate.toISOString(),
      avatarUrl: preacherProfile?.avatar_url ?? null,
    };
  }, [nearestPlan, preacherQ.data?.profile, sermonBlock, sermonDate]);

  const profile = useMemo(() => {
    const me = meQ.data;
    const feed = profileQ.data;
    const firstName = me?.first_name ?? feed?.profile.first_name ?? '';
    const lastName = me?.last_name ?? feed?.profile.last_name ?? '';
    return {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim() || me?.name || 'Участник',
      avatarUrl: feed?.profile.avatar_url ?? me?.avatar_url ?? null,
      role: me?.app_role ?? 'member',
      ministry: me?.ministry_role ?? null,
      postsCount: Array.isArray(feed?.posts) ? feed.posts.length : null,
    };
  }, [meQ.data, profileQ.data]);

  const birthdays = useMemo(
    () =>
      getUpcomingBirthdays(birthdaysQ.data?.items ?? [], 7).map((row) => ({
        id: row.id,
        name: row.name,
        birthDate: row.birth_date,
        weekDate: row.week_date,
        label: formatBirthdayLabel(row.week_date),
      })),
    [birthdaysQ.data?.items],
  );

  const prayers = useMemo(() => {
    const fromMembers = (prayersQ.data?.members ?? [])
      .filter((member) => String(member?.prayer_request ?? '').trim().length > 0)
      .map((member) => ({
        id: `member-${member.id}`,
        title: member.name,
        text: String(member.prayer_request ?? '').trim(),
        type: normalizePrayerType(member.prayer_request),
        updatedAt: member.prayer_need_updated_at ?? null,
      }));
    const urgent = notesQ.data?.urgent_prayer?.text
      ? [{
          id: 'coordinator-urgent',
          title: 'Срочная нужда',
          text: notesQ.data.urgent_prayer.text,
          type: 'urgent',
          updatedAt: notesQ.data.urgent_prayer.end_date,
        }]
      : [];
    return [...urgent, ...fromMembers];
  }, [notesQ.data?.urgent_prayer?.end_date, notesQ.data?.urgent_prayer?.text, prayersQ.data?.members]);

  const seenAtMs = Number(localStorage.getItem('dashboard_prayers_seen_at') ?? '0') || 0;
  const unreadCount = useMemo(
    () => prayers.filter((item) => new Date(item.updatedAt ?? 0).getTime() > seenAtMs).length,
    [prayers, seenAtMs],
  );

  const announcement = notesQ.data?.announcement
    ? { text: notesQ.data.announcement.text, tag: 'Объявление' }
    : null;

  const broadcast = broadcastQ.data?.broadcast ?? null;
  const isLive = isStreamLive({
    status: broadcast?.status,
    startTime: broadcast?.starts_at,
    endTime: broadcast?.starts_at ? new Date(new Date(broadcast.starts_at).getTime() + 2 * 60 * 60_000).toISOString() : null,
  });

  const nearestEvent = useMemo(() => {
    return (eventsQ.data ?? [])
      .map((event) => {
        const dt = new Date(`${event.event_date}T${event.event_time}:00`);
        return Number.isNaN(dt.getTime()) ? null : { event, dt };
      })
      .filter(Boolean)
      .sort((a, b) => a.dt.getTime() - b.dt.getTime())[0] ?? null;
  }, [eventsQ.data]);

  const mediaItem = podcastsQ.data?.episodes?.[0] ?? null;

  const nextServiceStart = nearestPlan ? parseServiceDateTime(nearestPlan)?.toISOString() ?? null : null;
  const events = {
    stream: {
      title: broadcast?.title?.trim() || 'Эфир',
      isLive,
      startsAt: broadcast?.starts_at ?? null,
      countdown: getTimeUntilService(nextServiceStart),
      link: '/broadcast',
    },
    media: {
      title: mediaItem?.title ?? 'Нет новых медиа',
      description: mediaItem?.description ?? null,
      link: '/resources/video',
    },
    event: nearestEvent
      ? {
          title: nearestEvent.event.title || 'Событие',
          description: nearestEvent.event.description || null,
          when: format(nearestEvent.dt, 'dd.MM.yyyy HH:mm'),
          link: '/events',
        }
      : {
          title: 'Ближайшее мероприятие',
          description: 'Мероприятия скоро появятся',
          when: null,
          link: '/events',
        },
  };

  return {
    sermon,
    profile,
    birthdays,
    prayers,
    unreadCount,
    announcement,
    events,
    nextServiceStart,
    isLoading:
      meQ.isLoading ||
      profileQ.isLoading ||
      birthdaysQ.isLoading ||
      prayersQ.isLoading ||
      eventsQ.isLoading ||
      plansQ.isLoading,
    isError:
      meQ.isError ||
      profileQ.isError ||
      birthdaysQ.isError ||
      prayersQ.isError ||
      eventsQ.isError ||
      plansQ.isError,
  };
}
