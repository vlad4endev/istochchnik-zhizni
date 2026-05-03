import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { format, isBefore, parse, startOfDay, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  LuArrowRight,
  LuCalendarDays,
  LuChurch,
  LuHeart,
  LuPlay,
  LuSettings,
  LuUser,
} from 'react-icons/lu';

import { fetchActiveBroadcast, type BroadcastData } from '../../../api/broadcast';
import { fetchPodcastFeed, type PodcastEpisode } from '../../../api/resources';
import {
  deleteDashboardCoordinatorNote,
  fetchDashboardCoordinatorNotes,
  getCycleCollectionClaims,
  getWeekBirthdays,
  formatCalendarDayKey,
  getActiveEvents,
  getCalendarDay,
  getWeekPlanMembers,
  type BirthdayWeekItem,
  type ChurchEventItem,
} from '../../calendar/api';
import { NextWeekPrayerPlanSection, userCanViewNextWeekPrayerPlan } from '../../calendar/components/NextWeekPrayerPlanSection';
import { useMe } from '@/hooks/useMe';
import { fetchProfileByUsername } from '../../profile/publicProfileApi';
import { SectionHeroToolbarEnd } from '@/components/SectionHeroToolbarEnd';
import { sectionHeroHeaderClass, sectionHeroStickyClassNested } from '../../../lib/sectionHeroChrome';
import { apiBoolean } from '../../../lib/apiBoolean';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { memberRosterName } from '../../../lib/memberRosterName';
import { pluralizeRu } from '../../../lib/pluralizeRu';
import type { Member } from '../../../types';
import { useAuthStore } from '../../auth/authStore';
import { useProfileDraftStore } from '../../profile/profileDraftStore';
import { useCoordinatorNoteEditorRequestStore } from '../coordinatorNoteEditorRequestStore';
import { LimitedRegistrationDashboard } from '../components/LimitedRegistrationDashboard';
import { DashboardSkeleton } from '@/components/skeletons/DashboardSkeleton';
import { keys } from '@/lib/queryKeys';

type DashboardEvent = {
  id: string;
  title: string;
  description: string;
  whenLabel: string;
  posterUrl: string | null;
};

function formatTodayLabel(now: Date): string {
  return `Сегодня ${format(now, 'EEEE, d MMMM', { locale: ru })}`;
}

function pickLatestEpisode(episodes: PodcastEpisode[]): PodcastEpisode | null {
  if (!episodes.length) return null;
  return [...episodes].sort((a, b) => {
    const at = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const bt = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return bt - at;
  })[0] ?? null;
}

function sameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function parseOnceEventDateTime(item: ChurchEventItem): Date | null {
  const ts = `${item.event_date}T${item.event_time}:00`;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nextWeeklyDate(now: Date, weeklyDay: number, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map((x) => Number(x) || 0);
  const base = new Date(now);
  const diff = (weeklyDay - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + diff);
  base.setHours(h, m, 0, 0);
  if (base.getTime() < now.getTime()) {
    base.setDate(base.getDate() + 7);
  }
  return base;
}

function eventNextOccurrence(now: Date, item: ChurchEventItem): Date | null {
  if (item.recurrence_type === 'weekly') {
    const weeklyDay = typeof item.weekly_day === 'number' ? item.weekly_day : 0;
    return nextWeeklyDate(now, weeklyDay, item.event_time);
  }
  return parseOnceEventDateTime(item);
}

function toDashboardEvent(now: Date, item: ChurchEventItem, date: Date): DashboardEvent {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const timeLabel = format(date, 'HH:mm');
  const whenLabel = sameDate(date, now)
    ? `Сегодня в ${timeLabel}`
    : sameDate(date, tomorrow)
      ? `Завтра в ${timeLabel}`
      : `${format(date, 'EEEE', { locale: ru })} в ${timeLabel}`;
  return {
    id: String(item.id),
    title: item.title.trim() || 'Событие',
    description: (item.description ?? '').trim() || 'Подробное описание скоро появится.',
    whenLabel,
    posterUrl: resolvePublicUrl(item.poster_url ?? null),
  };
}

function pickUpcomingEvent(now: Date, items: ChurchEventItem[]): DashboardEvent {
  const rows = items
    .map((item) => {
      const dt = eventNextOccurrence(now, item);
      return dt ? { item, dt } : null;
    })
    .filter((x): x is { item: ChurchEventItem; dt: Date } => x != null)
    .sort((a, b) => a.dt.getTime() - b.dt.getTime());

  if (rows.length === 0) {
    return {
      id: 'no-events',
      title: 'Событий пока нет',
      description: 'Администратор скоро добавит новые события.',
      whenLabel: 'Следите за обновлениями',
      posterUrl: null,
    };
  }

  const todayRow = rows.find((x) => sameDate(x.dt, now) && x.dt.getTime() >= now.getTime())
    ?? rows.find((x) => sameDate(x.dt, now));
  if (todayRow) return toDashboardEvent(now, todayRow.item, todayRow.dt);

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowRow = rows.find((x) => sameDate(x.dt, tomorrow));
  if (tomorrowRow) return toDashboardEvent(now, tomorrowRow.item, tomorrowRow.dt);

  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  const nearestWeek = rows.find((x) => x.dt.getTime() > now.getTime() && x.dt.getTime() <= weekEnd.getTime());
  if (nearestWeek) return toDashboardEvent(now, nearestWeek.item, nearestWeek.dt);

  const nearestAny = rows.find((x) => x.dt.getTime() > now.getTime()) ?? rows[0];
  return toDashboardEvent(now, nearestAny.item, nearestAny.dt);
}

function formatBirthdayChipDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'EEE, d MMM', { locale: ru });
}

function formatWeekDayChip(ymd: string): string {
  const d = parse(ymd, 'yyyy-MM-dd', new Date());
  if (Number.isNaN(d.getTime())) return ymd;
  return format(d, 'EEE d.MM', { locale: ru });
}

function formatDashboardDateLabel(now: Date): string {
  return format(now, 'EEEE, d MMMM', { locale: ru });
}

function truncatePrayerNeedPreview(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

/** Фамилия и имя для подписи в дашборде (как в списках). */
function memberFirstLastLine(m: Member): string {
  const s = memberRosterName(m).trim();
  return s || m.name.trim() || '—';
}

function formatBroadcastTimer(nowMs: number, broadcast: BroadcastData | null): string {
  if (!broadcast?.starts_at) return '—';
  if (broadcast.status === 'finished') return '—';
  const startsAtMs = new Date(broadcast.starts_at).getTime();
  if (!Number.isFinite(startsAtMs)) return '—';
  const diff = broadcast.status === 'live'
    ? Math.max(0, nowMs - startsAtMs)
    : Math.max(0, startsAtMs - nowMs);
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatBroadcastDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'dd.MM.yyyy HH:mm');
}

function mapPlatformLabel(platform: string | null | undefined): string {
  const p = String(platform ?? '').toLowerCase();
  if (p === 'youtube') return 'YouTube';
  if (p === 'rutube') return 'RuTube';
  if (p === 'vk') return 'VK Видео';
  return 'Платформа';
}

function shouldShowBroadcastWidget(nowMs: number, broadcast: BroadcastData | null): boolean {
  if (!broadcast) return false;
  if (broadcast.status === 'live') return true;
  if (broadcast.status !== 'scheduled' || !broadcast.starts_at) return false;
  const startsAtMs = new Date(broadcast.starts_at).getTime();
  if (!Number.isFinite(startsAtMs)) return false;
  const twoHoursMs = 2 * 60 * 60 * 1000;
  return nowMs >= startsAtMs - twoHoursMs;
}

function BroadcastCompactCard({
  broadcast,
  timerText,
  onOpen,
}: {
  broadcast: BroadcastData | null;
  timerText: string;
  onOpen: () => void;
}) {
  const status = broadcast?.status ?? 'none';
  const title = broadcast?.title?.trim() || 'Трансляция';
  const platform = mapPlatformLabel(broadcast?.platform);
  const timerLabel = status === 'live'
    ? 'Идёт трансляция'
    : status === 'scheduled'
      ? 'До начала'
      : 'Завершена';
  const dateLabel = status === 'live' ? 'Началась' : 'Начало';
  const description = (broadcast?.description ?? '').trim() || '—';
  const statusBadge = status === 'live'
    ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#D64035] px-2 py-0.5 text-[10px] font-bold text-white">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
        LIVE
      </span>
    )
    : status === 'scheduled'
      ? <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Скоро</span>
      : <span className="inline-flex rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-600">Нет трансляций</span>;

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3 bg-[#1a1a1a] px-3 py-2.5">
        <div className="grid h-[36px] w-[52px] place-items-center rounded-md bg-[#111] text-white/85">
          <LuPlay className="h-4 w-4" strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{title}</p>
          <div className="mt-1 flex items-center gap-2">
            {statusBadge}
            <span className="text-[11px] font-medium text-white/70">{platform}</span>
          </div>
        </div>
      </div>

      <div className="h-px bg-stone-200" />

      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold ${status === 'live' ? 'text-[#D64035]' : 'text-stone-500'}`}>{timerLabel}</p>
          <p className={`text-xl font-extrabold tabular-nums ${status === 'live' ? 'text-[#D64035]' : 'text-stone-900'}`}>{timerText}</p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-[36px] items-center justify-center rounded-xl bg-[#D64035] px-4 text-sm font-bold text-white hover:bg-[#bc342c]"
        >
          Смотреть
        </button>
      </div>

      <div className="h-px bg-stone-200" />

      <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
        <span className="font-semibold text-stone-500">{dateLabel}</span>
        <span className="font-semibold text-stone-800">{formatBroadcastDateTime(broadcast?.starts_at ?? null)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 px-3 pb-3 text-xs">
        <span className="font-semibold text-stone-500">Описание</span>
        <span className="max-w-[70%] truncate font-medium text-stone-700">{description}</span>
      </div>
    </section>
  );
}

function DashboardMain() {
  const qc = useQueryClient();
  const requestOpenCoordinatorNoteEditor = useCoordinatorNoteEditorRequestStore((s) => s.requestOpenEditor);
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const isAdmin = role === 'admin';
  const isPastor = role === 'pastor';
  const todayDateKey = useMemo(() => formatCalendarDayKey(now), [now]);
  /** Понедельник текущей недели (как на сервере) — чтобы кэш сбрасывался при смене недели. */
  const weekStartKey = useMemo(
    () => formatCalendarDayKey(startOfWeek(now, { weekStartsOn: 1 })),
    [now],
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [activeAudioTitle, setActiveAudioTitle] = useState<string>('');
  const [eventOpen, setEventOpen] = useState(false);
  const [announcementExpanded, setAnnouncementExpanded] = useState(false);
  const [broadcastNowMs, setBroadcastNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setBroadcastNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  /** Сразу после полуночи обновляем «сегодня» (даты дней рождения и др. блоков). */
  useEffect(() => {
    const msUntilMidnight = () => {
      const t = new Date();
      const next = new Date(t);
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      return Math.max(0, next.getTime() - t.getTime());
    };
    const id = window.setTimeout(() => setNow(new Date()), msUntilMidnight());
    return () => window.clearTimeout(id);
  }, [todayDateKey]);

  useEffect(() => {
    if (!eventOpen) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [eventOpen]);

  useEffect(() => {
    if (!eventOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEventOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [eventOpen]);

  const [favorites, setFavorites] = useState<Record<string, true>>(() => {
    try {
      const raw = localStorage.getItem('dashboard_sermon_favorites_v1');
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, true>;
      return parsed ?? {};
    } catch {
      return {};
    }
  });

  const meQ = useMe();

  const profileUsername = useAuthStore((s) => s.username ?? '');
  const profileMemberId = useAuthStore((s) => s.memberId);
  const publicProfileSlug =
    profileUsername.trim() || (profileMemberId != null ? `member-${profileMemberId}` : '');

  const myPublicProfileQ = useQuery({
    queryKey: ['profile', 'dashboard-public', publicProfileSlug],
    queryFn: () => fetchProfileByUsername(publicProfileSlug),
    enabled: publicProfileSlug.length > 0,
    staleTime: 60_000,
  });

  const prayerQ = useQuery({
    queryKey: keys.calendarDay(todayDateKey),
    queryFn: () => getCalendarDay(todayDateKey),
    staleTime: 60_000,
  });

  const broadcastQ = useQuery({
    queryKey: keys.broadcast,
    queryFn: fetchActiveBroadcast,
    staleTime: 60_000,
  });

  const sermonsQ = useQuery({
    queryKey: ['resources', 'podcasts', 'dashboard'],
    queryFn: () => fetchPodcastFeed({ limit: 30 }),
    staleTime: 60_000,
  });

  const eventsQ = useQuery({
    queryKey: keys.events,
    queryFn: getActiveEvents,
    staleTime: 60_000,
  });
  const birthdaysQ = useQuery({
    queryKey: ['calendar', 'birthdays', 'week', weekStartKey, todayDateKey],
    queryFn: getWeekBirthdays,
    /** Дни рождения зависят от «сегодня» — не держим устаревший список в кэше. */
    staleTime: 0,
    refetchInterval: 60_000,
  });
  const needsNextWeekPlan =
    apiBoolean(meQ.data?.is_collection_coordinator) || isAdmin || isPastor;
  const needsCurrentWeekPlan = isAdmin || isPastor;

  const collectionClaimsQ = useQuery({
    queryKey: ['calendar', 'cycle', 'collection-claims', 'next', 'dashboard'],
    queryFn: () => getCycleCollectionClaims('next'),
    enabled: needsNextWeekPlan,
    staleTime: 30_000,
  });
  const collectionClaimsCurrentQ = useQuery({
    queryKey: ['calendar', 'cycle', 'collection-claims', 'current', 'dashboard'],
    queryFn: () => getCycleCollectionClaims('current'),
    enabled: needsCurrentWeekPlan,
    staleTime: 30_000,
  });
  const weekMembersQ = useQuery({
    queryKey: ['calendar', 'week-members', 'next', 'dashboard'],
    queryFn: () => getWeekPlanMembers('next'),
    enabled: needsNextWeekPlan,
    staleTime: 30_000,
  });
  const weekMembersCurrentQ = useQuery({
    queryKey: ['calendar', 'week-members', 'current', 'dashboard'],
    queryFn: () => getWeekPlanMembers('current'),
    enabled: needsCurrentWeekPlan,
    staleTime: 30_000,
  });

  const dashboardNotesQ = useQuery({
    queryKey: keys.dashboardNotes(todayDateKey),
    queryFn: () => fetchDashboardCoordinatorNotes(todayDateKey),
    /** Срочные нужды и объявления: сразу подтягивать после WS `coordinator-notes` и при заходе на главную. */
    staleTime: 0,
  });

  const me = meQ.data ?? null;
  const fullName = `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim() || me?.name || 'Профиль';
  const pf = myPublicProfileQ.data ?? null;

  const profileDisplayTitle = useMemo(() => {
    if (!pf) return fullName;
    const fromProfile = pf.profile.display_name?.trim();
    if (fromProfile) return fromProfile;
    return fullName || pf.profile.username || 'Профиль';
  }, [pf, fullName]);

  const isPlaceholderUsername = Boolean(
    pf?.profile.username?.trim() && /^member-\d+$/i.test(pf.profile.username.trim()),
  );

  const profileHandleLine = useMemo(() => {
    if (!pf || isPlaceholderUsername) return null;
    const u = pf.profile.username?.trim();
    if (!u) return null;
    const at = `@${u}`;
    const t = profileDisplayTitle.trim();
    if (t.toLowerCase() === at.toLowerCase() || t.toLowerCase() === u.toLowerCase()) return null;
    return at;
  }, [pf, isPlaceholderUsername, profileDisplayTitle]);

  const avatarUrl = resolvePublicUrl(pf?.profile.avatar_url ?? me?.avatar_url ?? null);
  const publicationsCount = pf?.posts?.length ?? 0;
  const publicationsLabel = pluralizeRu(publicationsCount, ['публикация', 'публикации', 'публикаций']);
  const bioText = pf?.profile.bio?.trim() ?? '';
  const greetingName = (me?.first_name?.trim() || profileDisplayTitle || 'друг').split(' ')[0] ?? 'друг';
  const dashboardDateLabel = formatDashboardDateLabel(now);

  const hasProfilePostDraft = useProfileDraftStore((s) => s.hasActivePostDraft);

  const memberToday = prayerQ.data?.members?.[0] ?? null;
  const todayLabel = formatTodayLabel(now);

  const activeBroadcast = broadcastQ.data?.broadcast ?? null;
  const broadcastTimerText = formatBroadcastTimer(broadcastNowMs, activeBroadcast);
  const showBroadcastWidget = shouldShowBroadcastWidget(broadcastNowMs, activeBroadcast);

  const latestEpisode = pickLatestEpisode(sermonsQ.data?.episodes ?? []);
  const event = pickUpcomingEvent(now, eventsQ.data ?? []);
  const birthdaysThisWeek: BirthdayWeekItem[] = useMemo(() => {
    const items = birthdaysQ.data?.items ?? [];
    const todayStart = startOfDay(now);
    return items.filter((row) => {
      const raw = row.week_date.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
      const d = parse(raw, 'yyyy-MM-dd', new Date());
      if (Number.isNaN(d.getTime())) return false;
      return !isBefore(d, todayStart);
    });
  }, [birthdaysQ.data, now]);
  const birthdayBadgeText = useMemo(() => {
    const first = birthdaysThisWeek[0];
    if (!first) return null;
    const chipDate = formatBirthdayChipDate(first.week_date);
    return `🎂 ${first.name} — ${chipDate || 'скоро'}`;
  }, [birthdaysThisWeek]);

  /**
   * Текущая календарная неделя: с сегодняшнего дня — без текста нужды + координатор по закреплениям этой же недели.
   * (Следующая неделя — отдельно: назначения и план в блоке ниже.)
   */
  const unfilledWeekRowsAdmin = useMemo(() => {
    const days = weekMembersCurrentQ.data ?? [];
    const claims = collectionClaimsCurrentQ.data?.members ?? [];
    const claimById = new Map(claims.map((c) => [c.id, c]));
    const rows: Array<{ date: string; member: Member; coordinatorLabel: string }> = [];
    for (const row of days) {
      if (!row.member) continue;
      if (row.date < todayDateKey) continue;
      if ((row.member.prayer_request ?? '').trim().length > 0) continue;
      const c = claimById.get(row.member.id);
      const cb = c?.claimed_by;
      const coordinatorLabel = cb
        ? memberRosterName({
            id: cb.id,
            name: cb.name,
            first_name: cb.first_name,
            last_name: cb.last_name,
          })
        : 'не назначен';
      rows.push({ date: row.date, member: row.member, coordinatorLabel });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  }, [weekMembersCurrentQ.data, collectionClaimsCurrentQ.data?.members, todayDateKey]);

  /** Для админа: только участники цикла (`in_prayer_cycle`), у кого пустая нужда. */
  const adminUnfilledCycleRows = useMemo(
    () => unfilledWeekRowsAdmin.filter((r) => r.member.in_prayer_cycle !== false),
    [unfilledWeekRowsAdmin],
  );

  const adminNextWeekRosterRows = useMemo(() => {
    const days = [...(weekMembersQ.data ?? [])];
    days.sort((a, b) => a.date.localeCompare(b.date));
    return days;
  }, [weekMembersQ.data]);

  const adminNextWeekRosterStats = useMemo(() => {
    let withMember = 0;
    let filled = 0;
    let inCycle = 0;
    for (const row of adminNextWeekRosterRows) {
      const m = row.member;
      if (!m) continue;
      withMember += 1;
      if (m.in_prayer_cycle !== false) inCycle += 1;
      if ((m.prayer_request ?? '').trim().length > 0) filled += 1;
    }
    return { withMember, filled, inCycle };
  }, [adminNextWeekRosterRows]);
  const adminNextWeekProgress = useMemo(() => {
    if (adminNextWeekRosterStats.withMember <= 0) return 0;
    return Math.max(
      0,
      Math.min(100, (adminNextWeekRosterStats.filled / adminNextWeekRosterStats.withMember) * 100),
    );
  }, [adminNextWeekRosterStats]);
  /**
   * Следующая неделя: среди участников, закреплённых за координатором, у кого ещё пустая нужда
   * (по дням плана следующей недели — то же окно, что и «назначены»).
   */
  const coordinatorUnfilledRows = useMemo(() => {
    const meId = me?.id ?? null;
    if (meId == null) return [];
    const claims = collectionClaimsQ.data?.members ?? [];
    const claimedMemberIds = new Set(
      claims.filter((c) => c.claimed_by?.id === meId).map((c) => c.id),
    );
    const rows: Array<{ date: string; member: Member }> = [];
    for (const row of weekMembersQ.data ?? []) {
      if (!row.member) continue;
      if (row.date < todayDateKey) continue;
      if (!claimedMemberIds.has(row.member.id)) continue;
      if ((row.member.prayer_request ?? '').trim().length > 0) continue;
      rows.push({ date: row.date, member: row.member });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  }, [weekMembersQ.data, collectionClaimsQ.data?.members, me?.id, todayDateKey]);

  /** Все участники, закреплённые за текущим куратором на эту неделю (не только с пустой нуждой). */
  const coordinatorAssignedRows = useMemo(() => {
    const meId = me?.id ?? null;
    if (meId == null) return [];
    const claims = collectionClaimsQ.data?.members ?? [];
    const claimedMemberIds = new Set(
      claims.filter((c) => c.claimed_by?.id === meId).map((c) => c.id),
    );
    const rows = (weekMembersQ.data ?? [])
      .filter((r) => r.member && claimedMemberIds.has(r.member.id))
      .map((r) => ({ date: r.date, member: r.member as Member }));
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  }, [collectionClaimsQ.data?.members, weekMembersQ.data, me?.id]);

  const coordinatorProgressStats = useMemo(() => {
    if (isAdmin || isPastor) {
      return {
        total: adminNextWeekRosterStats.withMember,
        filled: adminNextWeekRosterStats.filled,
      };
    }
    const total = coordinatorAssignedRows.length;
    const filled = Math.max(0, total - coordinatorUnfilledRows.length);
    return { total, filled };
  }, [
    isAdmin,
    isPastor,
    adminNextWeekRosterStats.withMember,
    adminNextWeekRosterStats.filled,
    coordinatorAssignedRows.length,
    coordinatorUnfilledRows.length,
  ]);

  const isCollectionCoordinator = apiBoolean(me?.is_collection_coordinator);
  const canManageCoordinatorNotes =
    meQ.isSuccess && (isAdmin || isCollectionCoordinator);

  async function onDeleteAnnouncement() {
    if (!window.confirm('Удалить объявление?')) return;
    try {
      await deleteDashboardCoordinatorNote('announcement', todayDateKey);
      void qc.invalidateQueries({ queryKey: ['calendar', 'dashboard-coordinator-notes'] });
    } catch {
      /* toast optional */
    }
  }

  const showPrayerPlanOnDashboard =
    userCanViewNextWeekPrayerPlan(meQ.data) &&
    (isAdmin || isPastor || isCollectionCoordinator);

  const showInitialSkeleton =
    meQ.isPending &&
    prayerQ.isPending &&
    eventsQ.isPending &&
    !meQ.data &&
    !prayerQ.data &&
    !eventsQ.data;

  function onToggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = true;
      }
      try {
        localStorage.setItem('dashboard_sermon_favorites_v1', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function onPlayLatest() {
    if (!latestEpisode?.audioUrl) return;
    setActiveAudioUrl(latestEpisode.audioUrl);
    setActiveAudioTitle(latestEpisode.title);
    await Promise.resolve();
    try {
      await audioRef.current?.play();
    } catch {
      /* ignore autoplay errors */
    }
  }

  if (showInitialSkeleton) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--surface)]">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 sm:px-4 shell:px-6 md:px-8 xl:px-10 2xl:max-w-[1480px]">
        <div className={sectionHeroStickyClassNested}>
          <header
            className={[
              sectionHeroHeaderClass,
              'rounded-[22px] bg-[#6B2D3E] px-4 pb-6 pt-5 shadow-[0_12px_34px_rgba(72,20,34,0.36)] lg:rounded-none lg:px-7 lg:py-[22px]',
            ].join(' ')}
          >
            <div
              className="pointer-events-none absolute -right-6 -top-6 h-[130px] w-[130px] rounded-full bg-white/[0.07] lg:-top-10 lg:right-[120px] lg:h-[180px] lg:w-[180px]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-8 left-6 h-[90px] w-[90px] rounded-full bg-white/[0.04] lg:-bottom-[50px] lg:-right-[30px] lg:left-auto lg:h-[130px] lg:w-[130px]"
              aria-hidden
            />
            <div className="relative flex min-w-0 items-center gap-3">
              <div className="min-w-0 flex-1 animate-prayer-fade-up motion-reduce:animate-none">
                <p className="text-[13px] font-medium text-white/65">Добро пожаловать</p>
                <h1 className="mt-0.5 truncate text-[22px] font-semibold leading-tight tracking-tight text-white lg:text-[24px]">
                  {greetingName}
                </h1>
                <p className="mt-1 text-xs font-medium text-white/50">{dashboardDateLabel}</p>
              </div>
              {birthdayBadgeText ? (
                <div className="hidden max-w-[42%] shrink-0 truncate rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold text-white/95 lg:block">
                  {birthdayBadgeText}
                </div>
              ) : null}
              <div className="hidden items-center gap-2 lg:flex">
                <Link
                  to="/profile"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                  aria-label="Профиль"
                  title="Профиль"
                >
                  <LuUser className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                </Link>
                <Link
                  to="/profile"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                  aria-label="Настройки"
                  title="Настройки"
                >
                  <LuSettings className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                </Link>
              </div>
              <SectionHeroToolbarEnd>
                <Link
                  to="/profile"
                  className="tap-highlight-transparent flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-white shadow-sm transition hover:bg-white/25 active:scale-[0.98] md:hidden"
                  aria-label="Настройки профиля"
                  title="Настройки"
                >
                  <LuSettings className="h-5 w-5" strokeWidth={2} aria-hidden />
                </Link>
              </SectionHeroToolbarEnd>
            </div>
          </header>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto [webkit-overflow-scrolling:touch] pb-6 lg:pb-[max(2rem,env(safe-area-inset-bottom,0px))]">
        <div className="hidden lg:block">
          <div className="grid grid-cols-3 gap-[14px] px-0 py-4">
            <button
              type="button"
              onClick={() =>
                navigate(
                  publicProfileSlug
                    ? `/profile/${encodeURIComponent(publicProfileSlug)}`
                    : '/profile',
                )
              }
              className="group rounded-[14px] border border-[#E8E0DC] bg-white p-0 text-left transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]"
            >
              <div className="flex items-center gap-3.5 p-[16px]">
                <div className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-full border-2 border-[#E8D8DC] bg-stone-100">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-stone-500">
                      <LuUser className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-stone-900">{profileDisplayTitle}</p>
                  <span className="mt-1 inline-block rounded-full bg-[#F0ECF9] px-2 py-0.5 text-[11px] font-semibold text-[#6B47B8]">
                    {publicationsCount} {publicationsLabel}
                  </span>
                  <p className="mt-1 truncate text-xs text-stone-500">
                    {bioText || 'Откройте профиль для обновления информации'}
                  </p>
                </div>
              </div>
            </button>

            <section className="rounded-[14px] border border-[#F9C0D0] bg-gradient-to-br from-[#FFF0F3] to-[#FFE4EC] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]">
              <p className="text-[11px] font-semibold tracking-[0.02em] text-[#C23D57]">Дни рождения</p>
              {birthdaysThisWeek[0] ? (
                <div className="mt-3 flex items-start gap-3">
                  <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-[#E8536B] text-white">
                    <span className="text-lg" aria-hidden>🎂</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-[#3D1520]">{birthdaysThisWeek[0].name}</p>
                    <p className="mt-1 text-xs text-[#C23D57]">{formatBirthdayChipDate(birthdaysThisWeek[0].week_date)}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm font-medium text-[#C23D57]">На этой неделе дней рождения не запланировано.</p>
              )}
            </section>

            <button
              type="button"
              onClick={() => navigate('/prayer')}
              className="rounded-[14px] border border-[#BFC9F7] bg-gradient-to-br from-[#EEF2FF] to-[#E5EAFF] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]"
            >
              <p className="text-[11px] font-semibold tracking-[0.02em] text-[#3042A8]">Молимся сегодня</p>
              <div className="mt-3 flex items-start gap-3">
                <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-[#4A5FD5] text-white">
                  <LuChurch className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[#1A2560]">{memberToday?.name ?? 'Не назначен'}</p>
                  <p className="mt-1 text-xs text-[#4A5FD5]">{todayLabel}</p>
                </div>
              </div>
            </button>

            {dashboardNotesQ.data?.announcement ? (
              <section className="col-span-2 rounded-[14px] border border-[#F5D99A] bg-gradient-to-br from-[#FFF8EC] to-[#FEF0D6] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#E8960F] text-white">
                      <LuArrowRight className="h-4 w-4 rotate-45" strokeWidth={2} aria-hidden />
                    </span>
                    <p className="text-[11px] font-semibold tracking-[0.02em] text-[#9A6200]">Объявление</p>
                  </div>
                  {canManageCoordinatorNotes ? (
                    <details className="group relative">
                      <summary className="inline-flex min-h-[28px] min-w-[28px] cursor-pointer list-none items-center justify-center rounded-lg border border-amber-200 bg-white text-sm font-bold text-amber-900 marker:hidden [&::-webkit-details-marker]:hidden">
                        ⋯
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-40 space-y-1 rounded-[10px] border border-amber-200 bg-white p-1.5 shadow-lg">
                        <button
                          type="button"
                          className="inline-flex min-h-[34px] w-full items-center justify-start rounded-lg px-2.5 text-xs font-extrabold text-amber-950 hover:bg-amber-50"
                          onClick={() => requestOpenCoordinatorNoteEditor('announcement')}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-[34px] w-full items-center justify-start rounded-lg px-2.5 text-xs font-extrabold text-red-800 hover:bg-red-50"
                          onClick={() => void onDeleteAnnouncement()}
                        >
                          Удалить
                        </button>
                      </div>
                    </details>
                  ) : null}
                </div>
                <p className={announcementExpanded ? 'whitespace-pre-wrap text-[13px] font-semibold leading-[1.55] text-[#3D2800]' : 'line-clamp-3 whitespace-pre-wrap text-[13px] font-semibold leading-[1.55] text-[#3D2800]'}>
                  {dashboardNotesQ.data.announcement.text}
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-[#B87800] hover:underline"
                  onClick={() => setAnnouncementExpanded((v) => !v)}
                >
                  {announcementExpanded ? 'Свернуть' : 'Читать полностью'}
                </button>
              </section>
            ) : null}

            <section className="rounded-[14px] border border-stone-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#0E7E6A] text-white">
                    <LuPlay className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </span>
                  <p className="text-[11px] font-semibold tracking-[0.02em] text-[#0A5A4C]">Медиа</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/sermons')}
                  className="inline-flex min-h-[30px] items-center gap-1 rounded-[9px] border border-stone-200 bg-white px-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Все
                  <LuArrowRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              {latestEpisode ? (
                <>
                  <p className="mt-2 line-clamp-2 text-[14px] font-semibold text-stone-900">{latestEpisode.title}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void onPlayLatest()}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-[9px] bg-[#0E7E6A] px-4 text-[13px] font-semibold text-white hover:bg-[#0C6E5D]"
                    >
                      <LuPlay className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                      Воспроизвести
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(latestEpisode.id)}
                      className={[
                        'inline-flex min-h-[40px] items-center gap-2 rounded-[9px] px-4 text-[13px] font-semibold transition',
                        favorites[latestEpisode.id]
                          ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/70 hover:bg-rose-100'
                          : 'border-[1.5px] border-[#0E7E6A] bg-white text-[#0E7E6A] hover:bg-[#ECF8F5]',
                      ].join(' ')}
                    >
                      <LuHeart className="h-4 w-4" strokeWidth={2} aria-hidden />
                      В избранное
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm font-semibold text-stone-500">Новая проповедь пока не найдена.</p>
              )}
            </section>

            {showBroadcastWidget ? (
              <BroadcastCompactCard broadcast={activeBroadcast} timerText={broadcastTimerText} onOpen={() => navigate('/broadcast')} />
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={() => setEventOpen(true)}
              className="col-span-2 rounded-[14px] border border-[#A8E4C0] bg-gradient-to-br from-[#EDFBF3] to-[#D9F5E6] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]"
            >
              <p className="text-[11px] font-semibold tracking-[0.02em] text-[#0F6636]">Событие</p>
              <div className="mt-3 flex items-start gap-3">
                <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-[#1A9A55] text-white">
                  <LuCalendarDays className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[#0A2E18]">{event.title}</p>
                  <p className="mt-1 text-xs text-[#1A9A55]">{event.whenLabel}</p>
                </div>
              </div>
            </button>

            {showPrayerPlanOnDashboard ? (
              <section className="col-span-3 rounded-[14px] border border-[#E8E0DC] bg-[#F8F5F3] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]">
                <p className="text-[11px] font-semibold tracking-[0.02em] text-[#6B2D3E]">Координаторы</p>
                <div className="mt-3 grid grid-cols-3 gap-[10px]">
                  <div className="col-span-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-stone-600">
                      <span>Заполнение нужд</span>
                      <span>{coordinatorProgressStats.filled} из {coordinatorProgressStats.total || 0}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-[#E8E0DC]">
                      <div
                        className="h-full rounded bg-[#6B2D3E] transition-[width] duration-500 ease-out"
                        style={{
                          width: coordinatorProgressStats.total > 0
                            ? `${(coordinatorProgressStats.filled / coordinatorProgressStats.total) * 100}%`
                            : '0%',
                        }}
                      />
                    </div>
                  </div>

                  {(isAdmin || isPastor ? unfilledWeekRowsAdmin : coordinatorUnfilledRows).slice(0, 6).map((row) => (
                    <div
                      key={`desk-coordinator-${row.date}-${row.member.id}`}
                      className="rounded-[10px] border border-[#E8E0DC] bg-white px-3 py-2.5"
                    >
                      <p className="truncate text-[13px] font-semibold text-[#1a1a1a]">{memberFirstLastLine(row.member)}</p>
                      <p className="mt-1 text-[11px] text-[#888]">{formatWeekDayChip(row.date)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  {isAdmin ? (
                    <details className="group rounded-2xl border border-stone-200/70 bg-white/70 p-1 shadow-sm">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-sm font-extrabold text-stone-900 marker:hidden [&::-webkit-details-marker]:hidden">
                        <span>Назначения координаторов и правки плана</span>
                        <span className="shrink-0 rounded-full border border-stone-200/80 bg-white px-2 py-1 text-[11px] font-bold tracking-[0.02em] text-stone-600 group-open:hidden">
                          Развернуть
                        </span>
                        <span className="hidden shrink-0 rounded-full border border-stone-200/80 bg-white px-2 py-1 text-[11px] font-bold tracking-[0.02em] text-stone-600 group-open:inline">
                          Свернуть
                        </span>
                      </summary>
                      <div className="px-2 pb-2 pt-1">
                        <NextWeekPrayerPlanSection
                          canView
                          currentUserId={me?.id ?? null}
                          currentUserRole={me?.app_role ?? null}
                          isAdmin={isAdmin}
                        />
                      </div>
                    </details>
                  ) : (
                    <NextWeekPrayerPlanSection
                      canView
                      currentUserId={me?.id ?? null}
                      currentUserRole={me?.app_role ?? null}
                      isAdmin={isAdmin}
                    />
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <div className="dashboard-grid grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 xl:grid-cols-12 lg:hidden">
          {birthdaysThisWeek.length > 0 ? (
            <section className="overflow-hidden rounded-2xl border border-[#F9C0D0] bg-gradient-to-br from-[#FFF0F3] to-[#FFE4EC] p-4 shadow-[var(--shadow-card)] sm:col-span-2 sm:p-5 xl:col-span-12">
              <p className="text-[11px] font-semibold tracking-[0.02em] text-[#C23D57]">
                Предстоящие дни рождения на этой неделе
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {birthdaysThisWeek.map((row) => (
                  <span
                    key={`${row.id}-${row.week_date}`}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#F9C0D0] bg-white/90 px-3 py-2 text-sm font-bold text-[#3D1520]"
                  >
                    <span aria-hidden>🎉</span>
                    <span>{row.name}</span>
                    <span className="text-[#C23D57]">{formatBirthdayChipDate(row.week_date)}</span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <div className="flex flex-col gap-3 xl:col-span-4">
            <button
              type="button"
              onClick={() =>
                navigate(
                  publicProfileSlug
                    ? `/profile/${encodeURIComponent(publicProfileSlug)}`
                    : '/profile',
                )
              }
                className="tap-highlight-transparent touch-manipulation relative w-full overflow-hidden rounded-2xl border border-stone-200/70 bg-white/90 p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)] sm:min-h-[132px] sm:p-4"
            >
              <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-full bg-primary/[0.06] blur-2xl" />
              <div className="relative flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-[0.02em] text-[#6B2D3E]">Мой профиль</p>
                {hasProfilePostDraft ? (
                  <span
                    className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold tracking-[0.02em] text-amber-900"
                    title="Есть черновик поста на странице"
                  >
                    Черновик
                  </span>
                ) : null}
              </div>
              <div className="relative mt-3 flex items-start gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200/70">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-stone-500">
                      <LuUser className="h-6 w-6" strokeWidth={2} aria-hidden />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-extrabold leading-tight text-stone-900">{profileDisplayTitle}</p>
                  {profileHandleLine ? (
                    <p className="mt-0.5 truncate text-xs font-semibold text-stone-500">{profileHandleLine}</p>
                  ) : null}
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-stone-100/90 px-2.5 py-1 text-xs font-bold text-stone-700">
                    <span className="tabular-nums text-stone-900">{publicationsCount}</span>
                    <span>{publicationsLabel}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-stone-600">
                    {bioText || 'Откройте страницу, чтобы заполнить описание.'}
                  </p>
                </div>
              </div>
            </button>
            {dashboardNotesQ.data?.announcement ? (
              <section
                aria-label="Объявление"
                className="overflow-hidden rounded-2xl border border-[#F5D99A] bg-gradient-to-br from-[#FFF8EC] to-[#FEF0D6] p-4 shadow-[var(--shadow-card)]"
              >
                {canManageCoordinatorNotes ? (
                  <div className="mb-3 flex justify-end">
                    <details className="group relative">
                      <summary className="tap-highlight-transparent inline-flex min-h-[36px] min-w-[36px] cursor-pointer list-none items-center justify-center rounded-[10px] border border-amber-300/80 bg-white/90 px-2.5 text-base font-extrabold text-amber-950 hover:bg-amber-50 marker:hidden [&::-webkit-details-marker]:hidden">
                        <span aria-hidden>⋯</span>
                        <span className="sr-only">Действия с объявлением</span>
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-40 space-y-1 rounded-[10px] border border-amber-200 bg-white p-1.5 shadow-lg">
                        <button
                          type="button"
                          className="tap-highlight-transparent inline-flex min-h-[34px] w-full items-center justify-start rounded-lg px-2.5 text-xs font-extrabold text-amber-950 hover:bg-amber-50"
                          onClick={() => requestOpenCoordinatorNoteEditor('announcement')}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="tap-highlight-transparent inline-flex min-h-[34px] w-full items-center justify-start rounded-lg px-2.5 text-xs font-extrabold text-red-800 hover:bg-red-50"
                          onClick={() => void onDeleteAnnouncement()}
                        >
                          Удалить
                        </button>
                      </div>
                    </details>
                  </div>
                ) : null}
                <p className="text-[11px] font-semibold tracking-[0.02em] text-[#9A6200]">Объявление</p>
                <p
                  className={[
                    'announcement-text mt-2 whitespace-pre-wrap text-sm font-semibold leading-[1.55] text-[#3D2800]',
                    announcementExpanded ? 'announcement-text--expanded' : '',
                  ].join(' ')}
                >
                  {dashboardNotesQ.data.announcement.text}
                </p>
                <button
                  type="button"
                  className="announcement-expand-btn mt-2 hidden text-sm font-bold text-[#B87800] underline underline-offset-2"
                  onClick={() => setAnnouncementExpanded((v) => !v)}
                >
                  {announcementExpanded ? 'Свернуть' : 'Читать полностью'}
                </button>
              </section>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => navigate('/prayer')}
            className="tap-highlight-transparent touch-manipulation group min-h-[146px] overflow-hidden rounded-2xl border border-[#BFC9F7] bg-gradient-to-br from-[#EEF2FF] to-[#E5EAFF] p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)] sm:min-h-[152px] sm:p-5 xl:col-span-8"
          >
            <p className="text-[11px] font-semibold tracking-[0.02em] text-[#3042A8]">Молимся сегодня</p>
            <div className="mt-4 flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#4A5FD5] text-white">
                <LuChurch className="h-6 w-6" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-base font-extrabold text-[#1A2560]">{todayLabel}</p>
                <p className="mt-1 text-sm font-semibold text-[#4A5FD5]">
                  {memberToday ? `Молимся за ${memberToday.name}` : 'Сегодня в цикле участник не назначен'}
                </p>
              </div>
            </div>
          </button>

          {showBroadcastWidget ? (
            <div className="sm:col-span-2 xl:col-span-6">
              <BroadcastCompactCard broadcast={activeBroadcast} timerText={broadcastTimerText} onOpen={() => navigate('/broadcast')} />
            </div>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-stone-200/70 bg-white p-4 shadow-[var(--shadow-card)] sm:col-span-2 sm:p-5 xl:col-span-6">
            <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
              <p className="text-[11px] font-semibold tracking-[0.02em] text-[#0E7E6A]">Медиа</p>
              <button
                type="button"
                onClick={() => navigate('/sermons')}
                className="tap-highlight-transparent touch-manipulation inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border border-stone-200 bg-white px-3 text-xs font-extrabold text-stone-700 hover:bg-stone-50"
              >
                Все проповеди
                <LuArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>

            {latestEpisode ? (
              <div className="mt-4">
                <p className="line-clamp-2 text-base font-extrabold text-stone-900">{latestEpisode.title}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onPlayLatest()}
                    className="tap-highlight-transparent touch-manipulation inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] bg-[#0E7E6A] px-4 text-sm font-extrabold text-white hover:bg-[#0C6E5D] sm:w-auto"
                  >
                    <LuPlay className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                    Воспроизвести
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(latestEpisode.id)}
                    className={[
                      'tap-highlight-transparent touch-manipulation inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] px-4 text-sm font-extrabold transition sm:w-auto',
                      favorites[latestEpisode.id]
                        ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/70 hover:bg-rose-100'
                        : 'border-[1.5px] border-[#0E7E6A] bg-white text-[#0E7E6A] hover:bg-[#ECF8F5]',
                    ].join(' ')}
                  >
                    <LuHeart className="h-4 w-4" strokeWidth={2} aria-hidden />
                    {favorites[latestEpisode.id] ? 'В избранном' : 'В избранное'}
                  </button>
                </div>

                {activeAudioUrl ? (
                  <div className="mt-3 rounded-2xl border border-stone-200/70 bg-white p-3">
                    <p className="truncate text-xs font-semibold text-stone-500">{activeAudioTitle}</p>
                    <audio ref={audioRef} controls src={activeAudioUrl} className="mt-2 w-full" />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm font-semibold text-stone-500">Новая проповедь пока не найдена.</p>
            )}
          </section>

          <button
            type="button"
            onClick={() => setEventOpen(true)}
            className="tap-highlight-transparent touch-manipulation group min-h-[132px] overflow-hidden rounded-2xl border border-[#A8E4C0] bg-gradient-to-br from-[#EDFBF3] to-[#D9F5E6] p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)] sm:col-span-2 sm:min-h-[140px] sm:p-5 xl:col-span-12"
          >
            <p className="text-[11px] font-semibold tracking-[0.02em] text-[#0F6636]">События</p>
            <div className="mt-4 flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#1A9A55] text-white">
                <LuCalendarDays className="h-6 w-6" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-base font-extrabold text-[#0A2E18]">{event.title}</p>
                <p className="mt-1 text-sm font-semibold text-[#1A9A55]">{event.whenLabel}</p>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-[#2F6D49]">Нажмите, чтобы открыть описание события.</p>
              </div>
            </div>
          </button>

          {showPrayerPlanOnDashboard ? (
            <section className="rounded-2xl border border-[#E8E0DC] bg-[#F8F5F3] p-4 shadow-[var(--shadow-card)] sm:col-span-2 xl:col-span-12">
              <p className="text-[11px] font-semibold tracking-[0.02em] text-[#6B2D3E]">
                Координаторам сбора
              </p>
              {isAdmin || isPastor ? (
                <>
                  {(() => {
                    const leaderUnfilledRows = isAdmin ? adminUnfilledCycleRows : unfilledWeekRowsAdmin;
                    return leaderUnfilledRows.length > 0 ? (
                      <div className="mt-3">
                        <p className="text-sm font-semibold text-stone-800">
                          {isAdmin
                            ? 'На текущей неделе не заполнена молитвенная нужда (только участники цикла):'
                            : 'На текущей неделе не заполнена молитвенная нужда:'}
                        </p>
                        <ul className="mt-2 max-h-[min(40vh,320px)] space-y-2 overflow-y-auto pr-0.5">
                          {leaderUnfilledRows.map((row) => (
                            <li
                              key={`${row.date}-${row.member.id}`}
                            className="flex flex-col gap-0.5 rounded-[10px] border border-[#E8E0DC] bg-white px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                            >
                              <span className="font-bold text-stone-900">{memberFirstLastLine(row.member)}</span>
                              <span className="text-xs font-semibold text-stone-500">{formatWeekDayChip(row.date)}</span>
                              <span className="text-xs text-stone-600 sm:text-right">
                                Координатор: <span className="font-semibold text-stone-800">{row.coordinatorLabel}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-stone-600">
                        {isAdmin
                          ? 'На текущей неделе у всех участников цикла нужды заполнены.'
                          : 'На текущей неделе пустых нужд в плане не осталось.'}
                      </p>
                    );
                  })()}

                  {isAdmin ? (
                    <details className="group mt-4 rounded-2xl border border-stone-200/70 bg-white/70 p-1 shadow-sm">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-sm font-extrabold text-stone-900 marker:hidden [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          Список на следующую неделю
                          <span className="mt-0.5 block text-xs font-semibold text-stone-500">
                            {weekMembersQ.isFetching && !weekMembersQ.data
                              ? 'Загружаем…'
                              : adminNextWeekRosterStats.withMember > 0
                                ? `${adminNextWeekRosterStats.filled} из ${adminNextWeekRosterStats.withMember} заполнено`
                                : 'пока нет данных'}
                          </span>
                          {adminNextWeekRosterStats.withMember > 0 ? (
                            <span className="mt-2 block h-1.5 w-full overflow-hidden rounded bg-[#E8E0DC]">
                              <span
                                className="block h-full rounded bg-[#6B2D3E] transition-[width] duration-300 ease-out"
                                style={{ width: `${adminNextWeekProgress}%` }}
                              />
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 rounded-full border border-stone-200/80 bg-white px-2 py-1 text-[11px] font-bold tracking-[0.02em] text-stone-600 group-open:hidden">
                          Показать
                        </span>
                        <span className="hidden shrink-0 rounded-full border border-stone-200/80 bg-white px-2 py-1 text-[11px] font-bold tracking-[0.02em] text-stone-600 group-open:inline">
                          Скрыть
                        </span>
                      </summary>
                      <div className="px-2 pb-2 pt-1">
                        {weekMembersQ.isError ? (
                          <p className="text-sm text-red-700">Не удалось загрузить план недели. Обновите страницу.</p>
                        ) : adminNextWeekRosterRows.length === 0 ? (
                          <p className="text-sm text-stone-600">Пока нет строк плана на следующую неделю.</p>
                        ) : (
                          <ul className="max-h-[min(52vh,520px)] space-y-2 overflow-y-auto pr-0.5">
                            {adminNextWeekRosterRows.map((row) => {
                              const m = row.member;
                              const need = (m?.prayer_request ?? '').trim();
                              const filled = need.length > 0;
                              const inCycle = m ? m.in_prayer_cycle !== false : false;
                              return (
                                <li
                                  key={`roster-${row.date}-${m?.id ?? 'none'}`}
                                  className="rounded-[10px] border border-stone-200/70 bg-white/85 px-3 py-2 text-sm"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-extrabold text-stone-900">
                                        {m ? memberFirstLastLine(m) : '—'}
                                      </p>
                                      <p className="mt-0.5 text-xs font-semibold text-stone-500">{formatWeekDayChip(row.date)}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <p className="text-[11px] font-bold tracking-[0.02em] text-stone-500">
                                        {m ? (inCycle ? 'в цикле' : 'вне цикла') : '—'}
                                      </p>
                                      <p
                                        className={`mt-1 text-[11px] font-bold tracking-[0.02em] ${
                                          filled ? 'text-emerald-700' : 'text-amber-800'
                                        }`}
                                      >
                                        {filled ? 'нужда есть' : 'нужды нет'}
                                      </p>
                                    </div>
                                  </div>
                                  {filled ? (
                                    <p className="mt-2 text-xs font-medium leading-snug text-stone-700">
                                      {truncatePrayerNeedPreview(need, 140)}
                                    </p>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </details>
                  ) : null}
                </>
              ) : (
                <div className="mt-3">
                  {coordinatorAssignedRows.length > 0 ? (
                    <>
                      <p className="text-sm font-semibold text-stone-800">
                        Вам назначены участники на следующую неделю:
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {coordinatorAssignedRows.map((row) => (
                          <li
                            key={`assigned-${row.date}-${row.member.id}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#E8E0DC] bg-white px-3 py-2 text-sm"
                          >
                            <span className="font-bold text-stone-900">{memberFirstLastLine(row.member)}</span>
                            <span className="text-xs font-semibold text-stone-600">{formatWeekDayChip(row.date)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-sm text-stone-600">
                      На следующую неделю за вами пока нет закреплённых участников.
                    </p>
                  )}

                  <p className="mt-4 text-sm font-semibold text-stone-800">
                    Среди назначенных вам на следующую неделю пока нет текста нужды:
                  </p>
                  {coordinatorUnfilledRows.length > 0 ? (
                    <ul className="mt-2 space-y-1.5">
                      {coordinatorUnfilledRows.map((row) => (
                        <li
                          key={`${row.date}-${row.member.id}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#E8E0DC] bg-white px-3 py-2 text-sm"
                        >
                          <span className="font-bold text-stone-900">{memberFirstLastLine(row.member)}</span>
                          <span className="text-xs font-semibold text-stone-600">{formatWeekDayChip(row.date)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-stone-600">
                      У всех ваших участников на следующую неделю нужды уже заполнены.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate('/prayer')}
                    className="tap-highlight-transparent mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-extrabold text-white shadow-sm hover:bg-primary/90"
                  >
                    Заполнить в «Молитва»
                    <LuArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                </div>
              )}
              {isAdmin ? (
                <details className="group mt-4 rounded-2xl border border-stone-200/70 bg-white/70 p-1 shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-sm font-extrabold text-stone-900 marker:hidden [&::-webkit-details-marker]:hidden">
                    <span>Назначения координаторов и правки плана</span>
                    <span className="shrink-0 rounded-full border border-stone-200/80 bg-white px-2 py-1 text-[11px] font-bold tracking-[0.02em] text-stone-600 group-open:hidden">
                      Развернуть
                    </span>
                    <span className="hidden shrink-0 rounded-full border border-stone-200/80 bg-white px-2 py-1 text-[11px] font-bold tracking-[0.02em] text-stone-600 group-open:inline">
                      Свернуть
                    </span>
                  </summary>
                  <div className="px-2 pb-2 pt-1">
                    <NextWeekPrayerPlanSection
                      canView
                      currentUserId={me?.id ?? null}
                      currentUserRole={me?.app_role ?? null}
                      isAdmin={isAdmin}
                    />
                  </div>
                </details>
              ) : (
                <div className="mt-4">
                  <NextWeekPrayerPlanSection
                    canView
                    currentUserId={me?.id ?? null}
                    currentUserRole={me?.app_role ?? null}
                    isAdmin={isAdmin}
                  />
                </div>
              )}
            </section>
          ) : null}
        </div>
        </div>
      </div>

      {eventOpen ? (
        <div
          className="dashboard-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] [padding-left:max(0.75rem,env(safe-area-inset-left,0px))] [padding-right:max(0.75rem,env(safe-area-inset-right,0px))] sm:items-center sm:p-4"
          onClick={() => setEventOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="dashboard-sheet w-full max-w-lg max-h-[min(82vh,700px)] overflow-y-auto rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_24px_70px_rgba(0,0,0,0.2)] [webkit-overflow-scrolling:touch] sm:max-h-[88vh] sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-semibold tracking-[0.02em] text-[#0F6636]">Описание события</p>
            <h2 className="mt-2 text-xl font-extrabold tracking-tight text-stone-900">{event.title}</h2>
            <p className="mt-1 text-sm font-semibold text-primary">{event.whenLabel}</p>
            {event.posterUrl ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200/70 bg-stone-50">
                <img
                  src={event.posterUrl}
                  alt=""
                  className="h-[200px] w-full object-cover sm:h-[260px]"
                  loading="lazy"
                />
              </div>
            ) : null}
            <p className="mt-3 text-sm font-medium leading-relaxed text-stone-700">{event.description}</p>
            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setEventOpen(false)}
                className="tap-highlight-transparent touch-manipulation inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-stone-200 bg-white px-4 text-sm font-extrabold text-stone-700 hover:bg-stone-50"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DashboardPage() {
  const registrationStatus = useAuthStore((s) => s.registrationStatus ?? 'active');
  const firstName = useAuthStore((s) => s.firstName);

  if (registrationStatus === 'pending_review' || registrationStatus === 'rejected') {
    return (
      <LimitedRegistrationDashboard registrationStatus={registrationStatus} firstName={firstName} />
    );
  }

  return <DashboardMain />;
}
