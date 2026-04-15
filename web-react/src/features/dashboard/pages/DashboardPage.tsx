import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { format, parse } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  LuArrowRight,
  LuCalendarDays,
  LuChurch,
  LuHeart,
  LuPlay,
  LuTv,
  LuSettings,
  LuUser,
} from 'react-icons/lu';

import { fetchBroadcastEmbed } from '../../../api/broadcast';
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
import { fetchMe } from '../../profile/api';
import { fetchProfileByUsername } from '../../profile/publicProfileApi';
import { apiBoolean } from '../../../lib/apiBoolean';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { memberRosterName, splitMemberNameParts } from '../../../lib/memberRosterName';
import type { Member } from '../../../types';
import {
  extractBroadcastDateLabel,
  grantBroadcastAccess,
  isBroadcastLiveNow,
} from '../../broadcast/liveAccess';
import { useAuthStore } from '../../auth/authStore';
import { useProfileDraftStore } from '../../profile/profileDraftStore';
import { useCoordinatorNoteEditorRequestStore } from '../coordinatorNoteEditorRequestStore';
import { LimitedRegistrationDashboard } from '../components/LimitedRegistrationDashboard';

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

/** Имя и фамилия для подписи в дашборде. */
function memberFirstLastLine(m: Member): string {
  const { first, last } = splitMemberNameParts(m);
  const s = `${first} ${last}`.trim();
  return s || m.name.trim() || '—';
}

function DashboardMain() {
  const qc = useQueryClient();
  const requestOpenCoordinatorNoteEditor = useCoordinatorNoteEditorRequestStore((s) => s.requestOpenEditor);
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const isAdmin = role === 'admin';
  const todayDateKey = useMemo(() => formatCalendarDayKey(now), [now]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [activeAudioTitle, setActiveAudioTitle] = useState<string>('');
  const [eventOpen, setEventOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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

  const meQ = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchMe,
    staleTime: 60_000,
  });

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
    queryKey: ['calendar', 'day', todayDateKey],
    queryFn: () => getCalendarDay(todayDateKey),
    staleTime: 60_000,
  });

  const broadcastQ = useQuery({
    queryKey: ['broadcast'],
    queryFn: fetchBroadcastEmbed,
    staleTime: 60_000,
  });

  const sermonsQ = useQuery({
    queryKey: ['resources', 'podcasts', 'dashboard'],
    queryFn: () => fetchPodcastFeed({ limit: 30 }),
    staleTime: 60_000,
  });

  const eventsQ = useQuery({
    queryKey: ['calendar', 'events', 'dashboard'],
    queryFn: getActiveEvents,
    staleTime: 60_000,
  });
  const birthdaysQ = useQuery({
    queryKey: ['calendar', 'birthdays', 'week'],
    queryFn: getWeekBirthdays,
    staleTime: 300_000,
  });
  const collectionClaimsQ = useQuery({
    queryKey: ['calendar', 'cycle', 'collection-claims', 'current'],
    queryFn: () => getCycleCollectionClaims('current'),
    enabled: apiBoolean(meQ.data?.is_collection_coordinator) || isAdmin,
    staleTime: 30_000,
  });
  const weekMembersQ = useQuery({
    queryKey: ['calendar', 'week-members', 'current', 'dashboard'],
    queryFn: () => getWeekPlanMembers('current'),
    enabled: apiBoolean(meQ.data?.is_collection_coordinator) || isAdmin,
    staleTime: 30_000,
  });

  const dashboardNotesQ = useQuery({
    queryKey: ['calendar', 'dashboard-coordinator-notes', todayDateKey],
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
  const bioText = pf?.profile.bio?.trim() ?? '';

  const hasProfilePostDraft = useProfileDraftStore((s) => s.hasActivePostDraft);

  const memberToday = prayerQ.data?.members?.[0] ?? null;
  const todayLabel = formatTodayLabel(now);

  const showBroadcastCard = isAdmin || isBroadcastLiveNow(now);
  const broadcastDateLabel = extractBroadcastDateLabel(broadcastQ.data?.rutube_embed_code) ?? 'Сегодня, 10:30';

  const latestEpisode = pickLatestEpisode(sermonsQ.data?.episodes ?? []);
  const event = pickUpcomingEvent(now, eventsQ.data ?? []);
  const birthdaysThisWeek: BirthdayWeekItem[] = birthdaysQ.data?.items ?? [];

  /** С сегодняшнего дня недели: участники без нужды + подпись координатора (для админа). */
  const unfilledWeekRowsAdmin = useMemo(() => {
    const days = weekMembersQ.data ?? [];
    const claims = collectionClaimsQ.data?.members ?? [];
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
  }, [weekMembersQ.data, collectionClaimsQ.data?.members, todayDateKey]);

  /** Те же строки, но только по дням, закреплённым за текущим координатором. */
  const coordinatorUnfilledRows = useMemo(() => {
    const meId = me?.id ?? null;
    if (meId == null) return [];
    const claims = collectionClaimsQ.data?.members ?? [];
    const claimedMemberIds = new Set(
      claims.filter((c) => c.claimed_by?.id === meId).map((c) => c.id),
    );
    return unfilledWeekRowsAdmin.filter((r) => claimedMemberIds.has(r.member.id));
  }, [unfilledWeekRowsAdmin, collectionClaimsQ.data?.members, me?.id]);

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
    (isAdmin || (isCollectionCoordinator && coordinatorUnfilledRows.length > 0));

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

  return (
    <div className="min-h-full bg-[var(--surface)] px-3 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-2 sm:px-4 sm:pt-3 shell:px-6 md:px-8 xl:px-10">
      <div className="mx-auto w-full max-w-7xl 2xl:max-w-[1480px]">
        <div className="sticky top-0 z-40 pb-2 bg-[var(--surface)]/95 shadow-[0_4px_16px_rgba(0,0,0,0.02)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--surface)]/80">
          <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[#6d3039] to-primary-dark px-4 py-4 text-white shadow-[0_8px_32px_rgba(92,40,48,0.35)] sm:px-5 sm:py-5 md:px-6 md:py-5 shell:rounded-none">
            <div
              className="pointer-events-none absolute -right-4 -top-20 h-48 w-48 rounded-full bg-white/[0.13] blur-3xl animate-prayer-header-breathe motion-reduce:animate-none"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-black/18 blur-2xl"
              aria-hidden
            />
            <div className="relative flex items-center justify-between gap-3">
              <h1 className="min-w-0 text-xl font-extrabold leading-tight tracking-tight sm:text-2xl md:text-3xl lg:text-[1.65rem] xl:text-[26px] animate-prayer-fade-up motion-reduce:animate-none">
                Главная
              </h1>
              <Link
                to="/profile"
                className="tap-highlight-transparent flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-white shadow-sm transition hover:bg-white/25 active:scale-[0.98] md:hidden"
                aria-label="Настройки профиля"
                title="Настройки"
              >
                <LuSettings className="h-5 w-5" strokeWidth={2} aria-hidden />
              </Link>
            </div>
          </header>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 xl:grid-cols-12">
          {birthdaysThisWeek.length > 0 ? (
            <section className="overflow-hidden rounded-3xl border border-violet-200/70 bg-gradient-to-br from-violet-50/80 via-white to-fuchsia-50/70 p-4 shadow-[var(--shadow-card)] sm:col-span-2 sm:p-5 xl:col-span-12">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-700">
                День рождения на этой неделе
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {birthdaysThisWeek.map((row) => (
                  <span
                    key={`${row.id}-${row.week_date}`}
                    className="inline-flex items-center gap-2 rounded-2xl border border-violet-200/70 bg-white/90 px-3 py-2 text-sm font-bold text-stone-800"
                  >
                    <span aria-hidden>🎉</span>
                    <span>{row.name}</span>
                    <span className="text-violet-700">{formatBirthdayChipDate(row.week_date)}</span>
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
              className="tap-highlight-transparent touch-manipulation relative w-full overflow-hidden rounded-3xl border border-stone-200/70 bg-white/90 p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)] sm:min-h-[132px] sm:p-4"
            >
              <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-full bg-primary/[0.06] blur-2xl" />
              <div className="relative flex items-start justify-between gap-2">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-stone-500">Мой профиль</p>
                {hasProfilePostDraft ? (
                  <span
                    className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-900"
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
                    <span>публикаций</span>
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
                className="overflow-hidden rounded-3xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-orange-50/80 p-4 shadow-[var(--shadow-card)]"
              >
                {canManageCoordinatorNotes ? (
                  <div className="mb-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="tap-highlight-transparent inline-flex min-h-[36px] items-center justify-center rounded-xl border border-amber-300/80 bg-white/90 px-3 text-xs font-extrabold text-amber-950 hover:bg-amber-50"
                      onClick={() => requestOpenCoordinatorNoteEditor('announcement')}
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      className="tap-highlight-transparent inline-flex min-h-[36px] items-center justify-center rounded-xl border border-red-200 bg-red-50/90 px-3 text-xs font-extrabold text-red-800 hover:bg-red-100"
                      onClick={() => void onDeleteAnnouncement()}
                    >
                      Удалить
                    </button>
                  </div>
                ) : null}
                <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-amber-900/90">Объявление</p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-snug text-stone-900">
                  {dashboardNotesQ.data.announcement.text}
                </p>
              </section>
            ) : null}
          </div>

          {showPrayerPlanOnDashboard ? (
            <section className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)] sm:col-span-2 xl:col-span-12">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-primary/90">
                Координаторам сбора
              </p>
              {isAdmin ? (
                <>
                  {unfilledWeekRowsAdmin.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-sm font-semibold text-stone-800">
                        На текущей неделе не заполнена молитвенная нужда (с сегодня и дальше по циклу):
                      </p>
                      <ul className="mt-2 max-h-[min(40vh,320px)] space-y-2 overflow-y-auto pr-0.5">
                        {unfilledWeekRowsAdmin.map((row) => (
                          <li
                            key={`${row.date}-${row.member.id}`}
                            className="flex flex-col gap-0.5 rounded-xl border border-stone-200/80 bg-white/80 px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
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
                      На текущей неделе (с сегодня) у всех участников цикла нужды заполнены.
                    </p>
                  )}
                </>
              ) : (
                <div className="mt-3">
                  <p className="text-sm font-semibold text-stone-800">
                    У выбранных вами участников пока нет текста нужды:
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {coordinatorUnfilledRows.map((row) => (
                      <li
                        key={`${row.date}-${row.member.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-sm"
                      >
                        <span className="font-bold text-stone-900">{memberFirstLastLine(row.member)}</span>
                        <span className="text-xs font-semibold text-stone-600">{formatWeekDayChip(row.date)}</span>
                      </li>
                    ))}
                  </ul>
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
              <div className="mt-4">
                <NextWeekPrayerPlanSection canView currentUserId={me?.id ?? null} isAdmin={isAdmin} />
              </div>
            </section>
          ) : null}

          <button
            type="button"
            onClick={() => navigate('/prayer')}
            className="tap-highlight-transparent touch-manipulation group min-h-[146px] overflow-hidden rounded-3xl border border-stone-200/70 bg-white/85 p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)] sm:min-h-[152px] sm:p-5 xl:col-span-8"
          >
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-stone-500">Молимся сегодня</p>
            <div className="mt-4 flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <LuChurch className="h-6 w-6" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-base font-extrabold text-stone-900">{todayLabel}</p>
                <p className="mt-1 text-sm font-semibold text-stone-600">
                  {memberToday ? `Молимся за ${memberToday.name}` : 'Сегодня в цикле участник не назначен'}
                </p>
              </div>
            </div>
          </button>

          {showBroadcastCard ? (
            <button
              type="button"
              onClick={() => {
                grantBroadcastAccess();
                navigate('/broadcast', { state: { fromDashboard: true } });
              }}
              className="tap-highlight-transparent touch-manipulation group min-h-[146px] overflow-hidden rounded-3xl border border-stone-200/70 bg-white/85 p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)] sm:col-span-2 sm:min-h-[152px] sm:p-5 xl:col-span-6"
            >
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-stone-500">Трансляция</p>
              <div className="mt-4 flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-600">
                  <LuTv className="h-6 w-6" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-extrabold text-stone-900">{broadcastDateLabel}</p>
                  <p className="mt-1 text-sm font-semibold text-stone-600">
                    {broadcastQ.data?.rutube_embed_code ? 'Эфир доступен, открыть раздел трансляции' : 'Открыть раздел трансляции'}
                  </p>
                </div>
              </div>
            </button>
          ) : null}

          <section className="overflow-hidden rounded-3xl border border-stone-200/70 bg-white/85 p-4 shadow-[var(--shadow-card)] sm:col-span-2 sm:p-5 xl:col-span-6">
            <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-stone-500">Медиа</p>
              <button
                type="button"
                onClick={() => navigate('/sermons')}
                className="tap-highlight-transparent touch-manipulation inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-xs font-extrabold text-stone-700 hover:bg-stone-50"
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
                    className="tap-highlight-transparent touch-manipulation inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 text-sm font-extrabold text-white hover:bg-stone-800 sm:w-auto"
                  >
                    <LuPlay className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                    Воспроизвести
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(latestEpisode.id)}
                    className={[
                      'tap-highlight-transparent touch-manipulation inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-extrabold transition sm:w-auto',
                      favorites[latestEpisode.id]
                        ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/70 hover:bg-rose-100'
                        : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
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
            className="tap-highlight-transparent touch-manipulation group min-h-[132px] overflow-hidden rounded-3xl border border-stone-200/70 bg-white/85 p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)] sm:col-span-2 sm:min-h-[140px] sm:p-5 xl:col-span-12"
          >
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-stone-500">События</p>
            <div className="mt-4 flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                <LuCalendarDays className="h-6 w-6" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-base font-extrabold text-stone-900">{event.title}</p>
                <p className="mt-1 text-sm font-semibold text-stone-600">{event.whenLabel}</p>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-stone-500">Нажмите, чтобы открыть описание события.</p>
              </div>
            </div>
          </button>
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
            className="dashboard-sheet w-full max-w-lg max-h-[min(82vh,700px)] overflow-y-auto rounded-3xl border border-stone-200/80 bg-white p-4 shadow-[0_24px_70px_rgba(0,0,0,0.2)] [webkit-overflow-scrolling:touch] sm:max-h-[88vh] sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-stone-500">Описание события</p>
            <h2 className="mt-2 text-xl font-extrabold tracking-tight text-stone-900">{event.title}</h2>
            <p className="mt-1 text-sm font-semibold text-primary">{event.whenLabel}</p>
            {event.posterUrl ? (
              <div className="mt-4 overflow-hidden rounded-3xl border border-stone-200/70 bg-stone-50">
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
                className="tap-highlight-transparent touch-manipulation inline-flex min-h-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-extrabold text-stone-700 hover:bg-stone-50"
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
