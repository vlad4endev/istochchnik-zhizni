import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  LuArrowRight,
  LuCalendarDays,
  LuChurch,
  LuHeart,
  LuPlay,
  LuTv,
  LuUser,
} from 'react-icons/lu';

import { fetchBroadcastEmbed } from '../../../api/broadcast';
import { fetchPodcastFeed, type PodcastEpisode } from '../../../api/resources';
import {
  formatCalendarDayKey,
  getActiveEvents,
  getCalendarDay,
  type ChurchEventItem,
} from '../../calendar/api';
import { fetchMe } from '../../profile/api';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import {
  extractBroadcastDateLabel,
  grantBroadcastAccess,
  isBroadcastLiveNow,
} from '../../broadcast/liveAccess';

type DashboardEvent = {
  id: string;
  title: string;
  description: string;
  whenLabel: string;
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

export function DashboardPage() {
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
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

  const me = meQ.data ?? null;
  const fullName = `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim() || me?.name || 'Профиль';
  const avatarUrl = resolvePublicUrl(me?.avatar_url ?? null);

  const memberToday = prayerQ.data?.members?.[0] ?? null;
  const todayLabel = formatTodayLabel(now);

  const showBroadcastCard = isBroadcastLiveNow(now);
  const broadcastDateLabel = extractBroadcastDateLabel(broadcastQ.data?.rutube_embed_code) ?? 'Сегодня, 10:30';

  const latestEpisode = pickLatestEpisode(sermonsQ.data?.episodes ?? []);
  const event = pickUpcomingEvent(now, eventsQ.data ?? []);

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
    <div className="min-h-full bg-[var(--surface)] px-3 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-3 sm:px-4 sm:pt-4 shell:px-6 md:px-8 xl:px-10">
      <div className="mx-auto w-full max-w-7xl 2xl:max-w-[1480px]">
        <header className="mb-4 rounded-3xl bg-gradient-to-br from-primary via-[#7f3842] to-primary-dark p-4 text-white shadow-[0_16px_40px_rgba(92,40,48,0.35)] sm:mb-5 sm:p-6 lg:p-7">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-white/80">Главная</p>
          <h1 className="mt-2 text-xl font-extrabold tracking-tight sm:text-3xl lg:text-[2rem]">Добро пожаловать</h1>
          <p className="mt-1 text-sm font-medium text-white/85 sm:text-base lg:max-w-3xl">Удобный доступ к профилю, молитве, медиа и событиям дня.</p>
        </header>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 xl:grid-cols-12">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="tap-highlight-transparent touch-manipulation group min-h-[146px] overflow-hidden rounded-3xl border border-stone-200/70 bg-white/85 p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)] sm:min-h-[152px] sm:p-5 xl:col-span-4"
          >
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-stone-500">Мой профиль</p>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200/70">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-stone-500">
                    <LuUser className="h-6 w-6" strokeWidth={2} aria-hidden />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-stone-900">{fullName}</p>
                <p className="text-sm font-semibold text-stone-500">Открыть профиль</p>
              </div>
            </div>
          </button>

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
            <p className="mt-3 text-sm font-medium leading-relaxed text-stone-700">{event.description}</p>
            <div className="mt-5 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => setEventOpen(false)}
                className="tap-highlight-transparent touch-manipulation inline-flex min-h-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-extrabold text-stone-700 hover:bg-stone-50"
              >
                Закрыть
              </button>
              <button
                type="button"
                onClick={() => {
                  setEventOpen(false);
                  navigate('/service-flow');
                }}
                className="tap-highlight-transparent touch-manipulation inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 text-sm font-extrabold text-white hover:bg-primary-dark"
              >
                Открыть план служения
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
